import {
  applyAlgorithm,
  applyFaceTurns,
  FACE_TURNS,
  isSolved,
  nextBelow,
  randomCube,
  rotateCube,
  SOLVED,
  Xoshiro128StarStar,
  type CubieCube,
  type FaceTurn,
} from '@cube/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { getFlip, getSlice, getTwist, N_FLIP, N_TWIST } from './coordinates.ts';
import { axisDistances, createOptimalSolver, type OptimalSolve } from './optimal.ts';
import { buildOptimalTables, readPruneFile, type OptimalTables } from './optimal-tables.ts';
import { buildTwoPhaseTables, N_MOVES, type TwoPhaseTables } from './tables.ts';

let moves: TwoPhaseTables;
let tables: OptimalTables;
let solve: OptimalSolve;

beforeAll(() => {
  moves = buildTwoPhaseTables();
  const built = buildOptimalTables('standard', moves);
  if (built === null) throw new Error('not built');
  tables = built;
  solve = createOptimalSolver(tables);
}, 180_000);

function cubeAfter(algorithm: string): CubieCube {
  const result = applyAlgorithm(SOLVED, algorithm);
  if (!result.ok) throw new Error(algorithm);
  return result.value;
}

/** Shortest solution length by plain iterative deepening, with no tables at all. */
function bruteForceLength(cube: CubieCube, limit: number): number {
  function search(c: CubieCube, togo: number, lastFace: number): boolean {
    if (togo === 0) return isSolved(c);
    return FACE_TURNS.some((turn, m) => {
      const face = Math.floor(m / 3);
      const diff = lastFace - face;
      if (diff === 0 || diff === 3) return false;
      return search(applyFaceTurns(c, [turn]), togo - 1, face);
    });
  }
  for (let depth = 0; depth <= limit; depth++) if (search(cube, depth, -1)) return depth;
  return Number.POSITIVE_INFINITY;
}

/**
 * Exact distance to the phase 1 subgroup by IDA* over raw coordinates with the two-phase
 * solver's pair tables as the heuristic: an independent check of the symmetry-reduced table.
 */
function phase1Distance(cube: CubieCube): number {
  const { twistMove, flipMove, sliceMove, sliceTwistPrune, sliceFlipPrune, twistFlipPrune } = moves;
  const h = (t: number, f: number, s: number) =>
    Math.max(
      sliceTwistPrune[s * N_TWIST + t],
      sliceFlipPrune[s * N_FLIP + f],
      twistFlipPrune[t * N_FLIP + f],
    );
  function search(t: number, f: number, s: number, togo: number): boolean {
    if (togo === 0) return t === 0 && f === 0 && s === 0;
    for (let m = 0; m < N_MOVES; m++) {
      const t1 = twistMove[t * N_MOVES + m];
      const f1 = flipMove[f * N_MOVES + m];
      const s1 = sliceMove[s * N_MOVES + m];
      if (h(t1, f1, s1) < togo && search(t1, f1, s1, togo - 1)) return true;
    }
    return false;
  }
  const t = getTwist(cube.co);
  const f = getFlip(cube.eo);
  const s = getSlice(cube.ep);
  for (let depth = h(t, f, s); ; depth++) if (search(t, f, s, depth)) return depth;
}

const expectSolves = (cube: CubieCube, solution: readonly FaceTurn[] | undefined) => {
  expect(solution).toBeDefined();
  expect(isSolved(applyFaceTurns(cube, solution ?? []))).toBe(true);
};

describe('optimal solver', { timeout: 120_000 }, () => {
  it('builds the 35 MB table: 64,430 classes × 2187 twists at 2 bits', () => {
    expect(tables.prune.length).toBe(Math.ceil((64_430 * 2187) / 16));
    expect(tables.file.byteLength).toBe(35_227_136);
  });

  it('stores exact distances to the phase 1 subgroup on every axis', () => {
    const rng = Xoshiro128StarStar.fromSeed(11n);
    for (let i = 0; i < 12; i++) {
      const cube = randomCube(rng);
      const [ud, rl, fb] = axisDistances(tables, cube);
      expect(ud).toBe(phase1Distance(cube));
      expect(rl).toBe(phase1Distance(rotateCube(rotateCube(cube, 'R', 1), 'U', 1)));
      expect(fb).toBeLessThanOrEqual(12);
    }
  });

  it('solves the solved cube with no moves', () => {
    expect(solve(SOLVED).moves).toEqual([]);
  });

  it('agrees with brute force on short scrambles', () => {
    const rng = Xoshiro128StarStar.fromSeed(3n);
    for (let i = 0; i < 40; i++) {
      const length = 1 + (i % 5);
      const scramble = Array.from({ length }, () => FACE_TURNS[nextBelow(rng, 18)]);
      const cube = applyFaceTurns(SOLVED, scramble);
      const result = solve(cube);
      expectSolves(cube, result.moves);
      expect(result.moves?.length).toBe(bruteForceLength(cube, length));
    }
  });

  it('never needs more moves than the scramble', () => {
    const rng = Xoshiro128StarStar.fromSeed(4n);
    for (let i = 0; i < 12; i++) {
      const scramble = Array.from({ length: 6 + (i % 7) }, () => FACE_TURNS[nextBelow(rng, 18)]);
      const cube = applyFaceTurns(SOLVED, scramble);
      const result = solve(cube);
      expectSolves(cube, result.moves);
      expect(result.moves?.length).toBeLessThanOrEqual(scramble.length);
    }
  });

  it('returns a known solution once every shorter length is ruled out', () => {
    const cube = cubeAfter("R U F' L2 D B' R2 F");
    const optimal = solve(cube);
    expect(optimal.provedBound).toBe(false);
    const proved = solve(cube, optimal.moves === undefined ? {} : { upperBound: optimal.moves });
    expect(proved.provedBound).toBe(true);
    expect(proved.moves).toEqual(optimal.moves);
    // The final iteration is skipped, so proving costs fewer nodes than finding.
    expect(proved.nodes).toBeLessThan(optimal.nodes);
  });

  it('stops when asked to', () => {
    const result = solve(randomCube(Xoshiro128StarStar.fromSeed(5n)), { shouldStop: () => true });
    expect(result.cancelled).toBe(true);
    expect(result.moves).toBeUndefined();
  });

  it('restores its table from the saved file and rejects a damaged one', () => {
    expect(readPruneFile(tables.file, 'standard', tables.classes.count)).not.toBeNull();
    const damaged = tables.file.slice();
    damaged[1000] ^= 1;
    expect(readPruneFile(damaged, 'standard', tables.classes.count)).toBeNull();
    expect(readPruneFile(tables.file, 'huge', tables.classes.count)).toBeNull();
  });
});
