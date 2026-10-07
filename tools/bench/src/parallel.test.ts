import {
  applyFaceTurns,
  FACE_TURNS,
  isSolved,
  randomCube,
  SOLVED,
  Xoshiro128StarStar,
} from '@cube/core';
import {
  buildOptimalTables,
  buildTwoPhaseTables,
  createOptimalSolver,
  createParallelOptimalSolver,
} from '@cube/solver-ts';
import { describe, expect, it } from 'vitest';
import { nodeHelperPool } from './node-pool.ts';

describe('parallel optimal search', () => {
  it('generates exactly the sequential node counts at every completed depth', () => {
    const tables = buildOptimalTables('standard', buildTwoPhaseTables(), null, {}, true);
    if (tables === null) throw new Error('not built');
    const sequential = createOptimalSolver(tables);
    const pool = nodeHelperPool(3);
    const parallel = createParallelOptimalSolver(tables, pool);
    try {
      const rng = Xoshiro128StarStar.fromSeed(21n);
      for (let i = 0; i < 2; i++) {
        const cube = randomCube(rng);
        // Stop after depth 14, which already runs in parallel, and compare the work done.
        const throughDepth = (limit: number) => {
          let depth = 0;
          return {
            onProgress: (p: { depth: number }) => {
              depth = p.depth;
            },
            shouldStop: () => depth > limit,
          };
        };
        const a = sequential(cube, throughDepth(14));
        const b = parallel(cube, throughDepth(14));
        expect(b.depths.map((d) => [d.depth, d.nodes])).toEqual(
          a.depths.map((d) => [d.depth, d.nodes]),
        );
      }
      // A 14-move scramble is solved at a depth the helpers share, with an optimal length.
      const moves = Array.from({ length: 14 }, (_, k) => {
        const turn = FACE_TURNS[(k * 7 + 3) % 18];
        if (turn === undefined) throw new Error('no such turn');
        return turn;
      });
      const cube = applyFaceTurns(SOLVED, moves);
      const found = parallel(cube);
      const expected = sequential(cube);
      expect(found.moves).toBeDefined();
      expect(isSolved(applyFaceTurns(cube, found.moves ?? []))).toBe(true);
      expect(found.moves?.length).toBe(expected.moves?.length);
    } finally {
      parallel.dispose();
      pool.terminate();
    }
  }, 180_000);
});
