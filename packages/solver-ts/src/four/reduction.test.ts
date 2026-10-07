import {
  applyLayerTurns4,
  FACES,
  isSolved4,
  nextBelow,
  randomCube4,
  SOLVED_4,
  Xoshiro128StarStar,
  type LayerTurn,
  type Turns,
} from '@cube/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTwoPhaseTables } from '../tables.ts';
import { createTwoPhaseSolver } from '../two-phase.ts';
import { buildEdgePairing } from './edge-pairing.ts';
import { createReductionSolver, type ReductionSolve } from './reduction.ts';
import { buildReductionTables } from './tables.ts';

let solve: ReductionSolve;
beforeAll(() => {
  solve = createReductionSolver(
    buildReductionTables(),
    buildEdgePairing(),
    createTwoPhaseSolver(buildTwoPhaseTables()),
  );
});

describe('4×4×4 reduction', { timeout: 60_000 }, () => {
  it('solves the solved cube with no moves', () => {
    expect(solve(SOLVED_4).moves).toEqual([]);
  });

  // Speed and length are the benchmark's business (tools/bench); these tests check correctness.
  it('solves random states', () => {
    const rng = Xoshiro128StarStar.fromSeed(44);
    for (let i = 0; i < 5; i++) {
      const cube = randomCube4(rng);
      const { moves, phases } = solve(cube, { phase2Candidates: 20, phase3Candidates: 1 });
      expect(isSolved4(applyLayerTurns4(cube, moves ?? []))).toBe(true);
      expect(phases).toHaveLength(4);
    }
  });

  it('solves a cube scrambled with inner slices, wide turns of every face and rotations', () => {
    const rng = Xoshiro128StarStar.fromSeed(45);
    const scramble = Array.from({ length: 40 }, (): LayerTurn => {
      const face = FACES[nextBelow(rng, 6)];
      const from = 1 + nextBelow(rng, 4);
      const to = from + nextBelow(rng, 5 - from);
      return { face, from, to, turns: (1 + nextBelow(rng, 3)) as Turns };
    });
    const cube = applyLayerTurns4(SOLVED_4, scramble);
    const { moves } = solve(cube, { phase2Candidates: 20, phase3Candidates: 1 });
    expect(isSolved4(applyLayerTurns4(cube, moves ?? []))).toBe(true);
  });

  it('gives up without a solution when asked to stop', () => {
    const cube = randomCube4(Xoshiro128StarStar.fromSeed(46));
    expect(solve(cube, { shouldStop: () => true }).moves).toBeUndefined();
  });
});
