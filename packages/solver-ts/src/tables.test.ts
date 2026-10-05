import {
  applyFaceTurn,
  FACE_TURNS,
  randomCube,
  SOLVED,
  Xoshiro128StarStar,
  type CubieCube,
} from '@cube/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  getCornerPerm,
  getDEdges,
  getFlip,
  getSlice,
  getSlicePerm,
  getSliceSorted,
  getTwist,
  getUDEdgePerm,
  getUEdges,
  N_CORNER_PERM,
  N_FLIP,
  N_SLICE,
  N_SLICE_PERM,
  N_SLICE_SORTED,
  N_TWIST,
  N_UD_EDGE_GROUP,
  N_UD_EDGE_PERM,
  setCornerPerm,
  setDEdges,
  setFlip,
  setSliceSorted,
  setTwist,
  setUDEdgePerm,
  setUEdges,
} from './coordinates.ts';
import {
  buildTwoPhaseTables,
  N_MOVES,
  PHASE2_MOVES,
  TWO_PHASE_TABLE_COUNT,
  type TwoPhaseTables,
} from './tables.ts';

let tables: TwoPhaseTables;
let steps = 0;
beforeAll(() => {
  tables = buildTwoPhaseTables(() => steps++);
});

it('reports one build step per table', () => {
  expect(steps).toBe(TWO_PHASE_TABLE_COUNT);
  expect(Object.keys(tables)).toHaveLength(TWO_PHASE_TABLE_COUNT);
});

const rng = Xoshiro128StarStar.fromSeed(2026);
const randomCubes = Array.from({ length: 200 }, () => randomCube(rng));

/** Cubes in G1, reached by random phase 2 moves. */
const g1Cubes = Array.from({ length: 200 }, () => {
  let cube = SOLVED;
  for (let i = 0; i < 30; i++) {
    const m = PHASE2_MOVES[rng.nextU32() % PHASE2_MOVES.length];
    cube = applyFaceTurn(cube, FACE_TURNS[m]);
  }
  return cube;
});

describe('coordinates', () => {
  it.each([
    [
      'twist',
      N_TWIST,
      (v: number, a: Uint8Array) => {
        setTwist(v, a);
      },
      getTwist,
      8,
    ],
    [
      'flip',
      N_FLIP,
      (v: number, a: Uint8Array) => {
        setFlip(v, a);
      },
      getFlip,
      12,
    ],
    ['sliceSorted', N_SLICE_SORTED, setSliceSorted, getSliceSorted, 12],
    ['uEdges', N_UD_EDGE_GROUP, setUEdges, getUEdges, 12],
    ['dEdges', N_UD_EDGE_GROUP, setDEdges, getDEdges, 12],
    ['cornerPerm', N_CORNER_PERM, setCornerPerm, getCornerPerm, 8],
    ['udEdgePerm', N_UD_EDGE_PERM, setUDEdgePerm, getUDEdgePerm, 12],
  ] as const)('%s round-trips over its whole range', (_, size, set, get, length) => {
    const pieces = new Uint8Array(length);
    for (let v = 0; v < size; v++) {
      set(v, pieces);
      expect(get(pieces)).toBe(v);
    }
  });

  it('maps the solved cube to 0, except the D edges away from home', () => {
    expect(getTwist(SOLVED.co)).toBe(0);
    expect(getFlip(SOLVED.eo)).toBe(0);
    expect(getSliceSorted(SOLVED.ep)).toBe(0);
    expect(getUEdges(SOLVED.ep)).toBe(0);
    expect(getCornerPerm(SOLVED.cp)).toBe(0);
    expect(getUDEdgePerm(SOLVED.ep)).toBe(0);
  });

  it('puts every G1 cube at twist = flip = slice = 0', () => {
    for (const cube of g1Cubes) {
      expect([getTwist(cube.co), getFlip(cube.eo), getSlice(cube.ep)]).toEqual([0, 0, 0]);
      expect(getSliceSorted(cube.ep)).toBe(getSlicePerm(cube.ep));
    }
  });
});

describe('move tables', () => {
  const agree = (
    table: () => Uint16Array,
    coordinate: (cube: CubieCube) => number,
    cubes: readonly CubieCube[],
    moves: readonly number[],
  ) => {
    for (const cube of cubes) {
      for (const m of moves) {
        const after = coordinate(applyFaceTurn(cube, FACE_TURNS[m]));
        expect(table()[coordinate(cube) * N_MOVES + m]).toBe(after);
      }
    }
  };
  const ALL = Array.from({ length: N_MOVES }, (_, m) => m);

  it('agree with cubie multiplication for phase 1 coordinates', () => {
    agree(
      () => tables.twistMove,
      (c) => getTwist(c.co),
      randomCubes,
      ALL,
    );
    agree(
      () => tables.flipMove,
      (c) => getFlip(c.eo),
      randomCubes,
      ALL,
    );
    agree(
      () => tables.sliceMove,
      (c) => getSlice(c.ep),
      randomCubes,
      ALL,
    );
    agree(
      () => tables.sliceSortedMove,
      (c) => getSliceSorted(c.ep),
      randomCubes,
      ALL,
    );
    agree(
      () => tables.uEdgesMove,
      (c) => getUEdges(c.ep),
      randomCubes,
      ALL,
    );
    agree(
      () => tables.dEdgesMove,
      (c) => getDEdges(c.ep),
      randomCubes,
      ALL,
    );
    agree(
      () => tables.cornerPermMove,
      (c) => getCornerPerm(c.cp),
      randomCubes,
      ALL,
    );
  });

  it('agree with cubie multiplication for phase 2 coordinates inside G1', () => {
    agree(
      () => tables.udEdgePermMove,
      (c) => getUDEdgePerm(c.ep),
      g1Cubes,
      PHASE2_MOVES,
    );
  });

  it('rebuild the 8-edge permutation of a G1 cube from its U and D edge coordinates', () => {
    for (const cube of g1Cubes) {
      const index = getUEdges(cube.ep) * 24 + (getDEdges(cube.ep) % 24);
      expect(tables.udEdgesFromGroups[index]).toBe(getUDEdgePerm(cube.ep));
    }
  });
});

describe('pruning tables', () => {
  it('have the expected sizes', () => {
    expect(tables.sliceTwistPrune.length).toBe(N_SLICE * N_TWIST);
    expect(tables.sliceFlipPrune.length).toBe(N_SLICE * N_FLIP);
    expect(tables.cornerSlicePrune.length).toBe(N_CORNER_PERM * N_SLICE_PERM);
    expect(tables.udEdgeSlicePrune.length).toBe(N_UD_EDGE_PERM * N_SLICE_PERM);
  });

  it('never overestimate the distance of a scramble', () => {
    for (let length = 0; length <= 12; length++) {
      let cube = SOLVED;
      for (let i = 0; i < length; i++) cube = applyFaceTurn(cube, FACE_TURNS[rng.nextU32() % 18]);
      const slice = getSlice(cube.ep);
      expect(tables.sliceTwistPrune[slice * N_TWIST + getTwist(cube.co)]).toBeLessThanOrEqual(
        length,
      );
      expect(tables.sliceFlipPrune[slice * N_FLIP + getFlip(cube.eo)]).toBeLessThanOrEqual(length);
    }
  });

  it('match a plain queue-based breadth-first search', () => {
    // Reference for the level-by-level search with its backward switch.
    const sizeB = N_SLICE_PERM;
    const total = N_CORNER_PERM * sizeB;
    const expected = new Uint8Array(total).fill(255);
    const queue = new Uint32Array(total);
    expected[0] = 0;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const index = queue[head++];
      const a = Math.floor(index / sizeB);
      const b = index % sizeB;
      for (const m of PHASE2_MOVES) {
        const target =
          tables.cornerPermMove[a * N_MOVES + m] * sizeB + tables.sliceSortedMove[b * N_MOVES + m];
        if (expected[target] === 255) {
          expected[target] = expected[index] + 1;
          queue[tail++] = target;
        }
      }
    }
    expect(tables.cornerSlicePrune).toEqual(expected);
  });

  it('are zero exactly at the goal of each phase', () => {
    expect(tables.sliceTwistPrune.indexOf(0)).toBe(0);
    expect(tables.sliceTwistPrune.lastIndexOf(0)).toBe(0);
    expect(tables.cornerSlicePrune.lastIndexOf(0)).toBe(0);
    expect(tables.udEdgeSlicePrune.lastIndexOf(0)).toBe(0);
  });
});
