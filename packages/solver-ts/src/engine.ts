import { faceTurnIndex, type FaceTurn } from '@cube/core';
import type { OptimalTier, SolveHooks, SolveResult, SolverEngine } from '@cube/solver-contracts';
import { createOptimalSolver, optimalLowerBound, type OptimalSolve } from './optimal.ts';
import { buildOptimalTables, type OptimalTables } from './optimal-tables.ts';
import { buildTwoPhaseTables, TWO_PHASE_TABLE_COUNT, type TwoPhaseTables } from './tables.ts';
import { createTwoPhaseSolver, type TwoPhaseSolve } from './two-phase.ts';

/**
 * Before the optimal search, the two-phase solver gets this long to find a short solution. It is
 * shown at once, kept if the search is cancelled, and proven optimal without the final iteration
 * when nothing shorter exists.
 */
const UPPER_BOUND_MS = 1000;

/** The TypeScript solvers behind the engine-neutral worker protocol. */
export function createTypeScriptEngine(): SolverEngine {
  let fast: { readonly tables: TwoPhaseTables; readonly solve: TwoPhaseSolve } | undefined;
  // One tier at a time: the huge table is too large to keep the standard one next to it.
  let optimal:
    | { readonly tier: OptimalTier; readonly tables: OptimalTables; readonly solve: OptimalSolve }
    | undefined;

  const ready = () => {
    if (fast === undefined) throw new Error('Call init() before using the engine');
    return fast;
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
      optimal = undefined;
      const tables = buildOptimalTables(tier, ready().tables, saved, hooks);
      if (tables === null) return null;
      optimal = { tier, tables, solve: createOptimalSolver(tables) };
      return {
        tableBytes: tables.file.byteLength + tables.classes.classOf.byteLength,
        file: tables.file,
        restored: tables.file === saved,
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
