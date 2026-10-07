import { faceTurnIndex, MOVES_4, type FaceTurn, type LayerTurn } from '@cube/core';
import type {
  FourSolver,
  OptimalTier,
  SolveHooks,
  SolveResult,
  SolverEngine,
} from '@cube/solver-contracts';
import { buildEdgePairing } from './four/edge-pairing.ts';
import { createReductionSolver, type ReductionSolve } from './four/reduction.ts';
import { buildReductionTables } from './four/tables.ts';
import { createOptimalSolver, optimalLowerBound, type OptimalSolve } from './optimal.ts';
import { buildOptimalTables, type OptimalTables } from './optimal-tables.ts';
import { createParallelOptimalSolver, type HelperPool } from './parallel.ts';
import { buildTwoPhaseTables, TWO_PHASE_TABLE_COUNT, type TwoPhaseTables } from './tables.ts';
import { createTwoPhaseSolver, type TwoPhaseSolve } from './two-phase.ts';

/**
 * Before the optimal search, the two-phase solver gets this long to find a short solution. It is
 * shown at once, kept if the search is cancelled, and proven optimal without the final iteration
 * when nothing shorter exists.
 */
const UPPER_BOUND_MS = 1000;

export interface EngineOptions {
  /**
   * Starts helper threads for the optimal search. Without it, or without shared memory, the
   * optimal search runs in the engine's own thread.
   */
  readonly helpers?: () => HelperPool;
}

const moveIndex4 = (turn: LayerTurn) => {
  const index = MOVES_4.findIndex(
    (m) =>
      m.face === turn.face && m.from === turn.from && m.to === turn.to && m.turns === turn.turns,
  );
  if (index === -1) throw new Error('The 4×4×4 solver made a move outside MOVES_4');
  return index;
};

/** Reduction tables in three steps, then the edge pairing table. */
const FOUR_STEPS = 4;

/** The TypeScript solvers behind the engine-neutral worker protocol. */
export function createTypeScriptEngine({ helpers }: EngineOptions = {}): SolverEngine {
  const parallel = helpers !== undefined && typeof SharedArrayBuffer === 'function';
  // Started on the first optimal preparation and kept: helpers are reused across tiers.
  let pool: HelperPool | undefined;
  let fast: { readonly tables: TwoPhaseTables; readonly solve: TwoPhaseSolve } | undefined;
  // One tier at a time: the huge table is too large to keep the standard one next to it.
  let optimal:
    | {
        readonly tier: OptimalTier;
        readonly tables: OptimalTables;
        readonly solve: OptimalSolve;
        readonly dispose: () => void;
      }
    | undefined;

  const ready = () => {
    if (fast === undefined) throw new Error('Call init() before using the engine');
    return fast;
  };

  // Built on the first 4×4×4 request; the 3×3×3 finish reuses the fast solver.
  let reduction: { readonly solve: ReductionSolve; readonly tableBytes: number } | undefined;
  const four: FourSolver = {
    prepare(onProgress) {
      if (reduction === undefined) {
        let done = 0;
        const tables = buildReductionTables(() => {
          onProgress(++done, FOUR_STEPS);
        });
        const edges = buildEdgePairing();
        onProgress(FOUR_STEPS, FOUR_STEPS);
        reduction = {
          solve: createReductionSolver(tables, edges, ready().solve),
          tableBytes: tables.bytes + edges.prune.byteLength,
        };
      }
      return { tableBytes: reduction.tableBytes };
    },
    solve(cube, shouldStop) {
      four.prepare(() => undefined);
      const begin = performance.now();
      const result = reduction?.solve(cube, { shouldStop });
      return {
        moves: result?.moves?.map(moveIndex4) ?? null,
        phases: result?.phases ?? [],
        elapsedMs: performance.now() - begin,
      };
    },
  };

  function solveOptimal(
    { tables, solve }: NonNullable<typeof optimal>,
    cube: Parameters<OptimalSolve>[0],
    hooks: SolveHooks,
  ): SolveResult {
    const begin = performance.now();
    // Reaching the lower bound proves the quick solution optimal, so stop there.
    const quick = ready().solve(cube, {
      maxLength: optimalLowerBound(tables, cube),
      timeLimitMs: UPPER_BOUND_MS,
      shouldStop: hooks.shouldStop,
      onImprovement: (moves) => {
        hooks.onImprovement(moves.map(faceTurnIndex));
      },
    });
    const quickNodes = quick.stats.phase1Nodes + quick.stats.phase2Nodes;
    const known: readonly FaceTurn[] | undefined = quick.moves;
    const bestLength = known?.length ?? null;
    const result = solve(cube, {
      ...(known === undefined ? {} : { upperBound: known }),
      shouldStop: hooks.shouldStop,
      onProgress: ({ depth, nodes }) => {
        hooks.onProgress({
          depth,
          bestLength,
          nodes: quickNodes + nodes,
          elapsedMs: performance.now() - begin,
        });
      },
    });
    const moves = result.moves ?? known;
    if (!result.cancelled && result.moves !== undefined && !result.provedBound) {
      hooks.onImprovement(result.moves.map(faceTurnIndex));
    }
    return {
      moves: moves?.map(faceTurnIndex) ?? null,
      stoppedBy: result.cancelled ? 'cancelled' : 'proven',
      nodes: quickNodes + result.nodes,
      elapsedMs: performance.now() - begin,
    };
  }

  return {
    name: 'TypeScript',
    four,
    allocateTableFile: (size) =>
      new Uint8Array(parallel ? new SharedArrayBuffer(size) : new ArrayBuffer(size)),
    init(onProgress) {
      let done = 0;
      let tableBytes = 0;
      const tables = buildTwoPhaseTables((step) => {
        tableBytes += step.bytes;
        onProgress(++done, TWO_PHASE_TABLE_COUNT);
      });
      fast = { tables, solve: createTwoPhaseSolver(tables) };
      return { tableBytes };
    },
    prepareOptimal(tier, saved, hooks) {
      optimal?.dispose();
      optimal = undefined;
      const tables = buildOptimalTables(tier, ready().tables, saved, hooks, parallel);
      if (tables === null) return null;
      if (parallel) {
        pool ??= helpers();
        const solve = createParallelOptimalSolver(tables, pool);
        optimal = { tier, tables, solve, dispose: solve.dispose };
      } else {
        optimal = { tier, tables, solve: createOptimalSolver(tables), dispose: () => undefined };
      }
      return {
        tableBytes: tables.file.byteLength + tables.classes.classOf.byteLength,
        file: tables.file,
        restored: tables.restored,
      };
    },
    solve(cube, options, hooks) {
      if (options.mode === 'optimal') {
        if (optimal?.tier !== options.tier) {
          throw new Error(`Prepare the ${options.tier} optimal tables before solving`);
        }
        return solveOptimal(optimal, cube, hooks);
      }
      const result = ready().solve(cube, {
        maxLength: options.maxLength,
        timeLimitMs: options.timeLimitMs,
        shouldStop: hooks.shouldStop,
        onProgress: ({ depth, bestLength, nodes, elapsedMs }) => {
          hooks.onProgress({ depth, bestLength: bestLength ?? null, nodes, elapsedMs });
        },
        onImprovement: (moves) => {
          hooks.onImprovement(moves.map(faceTurnIndex));
        },
      });
      return {
        moves: result.moves?.map(faceTurnIndex) ?? null,
        stoppedBy: result.stoppedBy,
        nodes: result.stats.phase1Nodes + result.stats.phase2Nodes,
        elapsedMs: result.stats.elapsedMs,
      };
    },
  };
}
