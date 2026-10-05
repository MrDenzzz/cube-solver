import { faceTurnIndex } from '@cube/core';
import type { SolverEngine } from '@cube/solver-contracts';
import { buildTwoPhaseTables, TWO_PHASE_TABLE_COUNT } from './tables.ts';
import { createTwoPhaseSolver, type TwoPhaseSolve } from './two-phase.ts';

/** The TypeScript two-phase solver behind the engine-neutral worker protocol. */
export function createTwoPhaseEngine(): SolverEngine {
  let solve: TwoPhaseSolve | undefined;
  return {
    name: 'TypeScript',
    init(onProgress) {
      let done = 0;
      let tableBytes = 0;
      const tables = buildTwoPhaseTables((step) => {
        tableBytes += step.bytes;
        onProgress(++done, TWO_PHASE_TABLE_COUNT);
      });
      solve = createTwoPhaseSolver(tables);
      return { tableBytes };
    },
    solve(cube, options, hooks) {
      if (solve === undefined) throw new Error('Call init() before solve()');
      const result = solve(cube, {
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
