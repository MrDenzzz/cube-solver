import {
  applyAlgorithm,
  applyFaceTurns,
  isSolved,
  randomCube,
  SOLVED,
  Xoshiro128StarStar,
  type CubieCube,
} from '@cube/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTwoPhaseTables } from './tables.ts';
import { createTwoPhaseSolver, type TwoPhaseSolve } from './two-phase.ts';

let solve: TwoPhaseSolve;
beforeAll(() => {
  solve = createTwoPhaseSolver(buildTwoPhaseTables());
});

function cubeAfter(algorithm: string): CubieCube {
  const result = applyAlgorithm(SOLVED, algorithm);
  if (!result.ok) throw new Error(algorithm);
  return result.value;
}

describe('two-phase solver', () => {
  it('solves the solved cube with no moves', () => {
    const result = solve(SOLVED);
    expect(result.moves).toEqual([]);
    expect(result.stoppedBy).toBe('target');
  });

  it('solves a cube already in G1 in phase 2 alone', () => {
    const result = solve(cubeAfter('U R2 D2 F2 L2 U'));
    expect(result.moves).toBeDefined();
    expect(isSolved(applyFaceTurns(cubeAfter('U R2 D2 F2 L2 U'), result.moves ?? []))).toBe(true);
    expect(result.moves?.length).toBeLessThanOrEqual(6);
  });

  it('finds solutions of at most 20 moves for random states, and they solve the cube', () => {
    const rng = Xoshiro128StarStar.fromSeed(20);
    for (let i = 0; i < 25; i++) {
      const cube = randomCube(rng);
      const result = solve(cube, { maxLength: 20, timeLimitMs: 10_000 });
      expect(result.moves).toBeDefined();
      const moves = result.moves ?? [];
      expect(isSolved(applyFaceTurns(cube, moves))).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(20);
    }
  });

  it('stops at once when cancelled, without a solution', () => {
    const cube = randomCube(Xoshiro128StarStar.fromSeed(1));
    const result = solve(cube, { maxLength: 1, shouldStop: () => true });
    expect(result.stoppedBy).toBe('cancelled');
  });

  it('returns the best solution so far when the time is up', () => {
    const cube = randomCube(Xoshiro128StarStar.fromSeed(2));
    const result = solve(cube, { maxLength: 1, timeLimitMs: 50 });
    expect(result.stoppedBy).toBe('time');
    expect(isSolved(applyFaceTurns(cube, result.moves ?? []))).toBe(true);
  });
});
