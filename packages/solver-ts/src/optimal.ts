import {
  FACE_TURNS,
  faceTurnIndex,
  rotateCube,
  rotateFace,
  type CubieCube,
  type Face,
  type FaceTurn,
  type Turns,
} from '@cube/core';
import {
  getCornerPerm,
  getFlip,
  getSliceSorted,
  getTwist,
  N_FLIP,
  N_TWIST,
} from './coordinates.ts';
import { SLICE_OF_SORTED, type OptimalTables } from './optimal-tables.ts';
import type { FlipSliceClasses } from './sym-coordinates.ts';
import { N_SYM } from './symmetry.ts';
import { N_MOVES } from './tables.ts';

export interface OptimalOptions {
  /**
   * A known solution, for example from the two-phase solver. Once every shorter length has been
   * searched without success it is proven optimal and returned, which skips the last and usually
   * longest iteration.
   */
  readonly upperBound?: readonly FaceTurn[];
  /** Polled during the search; returning true abandons it. */
  readonly shouldStop?: () => boolean;
  /** Called about every million nodes and at each new depth. */
  readonly onProgress?: (progress: OptimalProgress) => void;
}

export interface OptimalProgress {
  /** The length being searched: every shorter solution has been ruled out. */
  readonly depth: number;
  readonly nodes: number;
  readonly elapsedMs: number;
}

export interface DepthStats {
  readonly depth: number;
  readonly nodes: number;
  readonly ms: number;
}

export interface OptimalResult {
  /** A shortest solution, or undefined if the search was cancelled. */
  readonly moves: readonly FaceTurn[] | undefined;
  readonly cancelled: boolean;
  /** Whether the result is the upper bound passed in, proven optimal without a final search. */
  readonly provedBound: boolean;
  readonly nodes: number;
  readonly elapsedMs: number;
  readonly depths: readonly DepthStats[];
}

export type OptimalSolve = (cube: CubieCube, options?: OptimalOptions) => OptimalResult;

interface Rotation {
  readonly axis: Face;
  readonly turns: Turns;
}

/**
 * The cube is looked at along three axes: as given, and rotated 120° and 240° about the URF–DBL
 * diagonal (x then y), which brings the R/L and then the F/B axis to U/D. The distance to each
 * axis's phase 1 subgroup is a lower bound, and so is their maximum (Reid, 1997).
 */
const AXES: readonly (readonly Rotation[])[] = [0, 1, 2].map((times) =>
  Array.from({ length: times }, (): readonly Rotation[] => [
    { axis: 'R', turns: 1 },
    { axis: 'U', turns: 1 },
  ]).flat(),
);

/** moveOnAxis[axis · 18 + m]: the move m of the original cube, as seen along the axis. */
const moveOnAxis = Uint8Array.from({ length: AXES.length * N_MOVES }, (_, i) => {
  const axis = AXES[Math.floor(i / N_MOVES)];
  const { face, turns } = FACE_TURNS[i % N_MOVES];
  const seen = axis.reduce((f, r) => rotateFace(f, r.axis, r.turns), face);
  return faceTurnIndex({ face: seen, turns });
});

export const MAX_DEPTH = 24;

// Search outcomes, as numbers to keep the recursion cheap.
export const FOUND = 1;
export const NONE = 0;
export const STOPPED = -1;
export type Outcome = typeof FOUND | typeof NONE | typeof STOPPED;
const CHECK_INTERVAL = 1 << 20;

// Per depth: twist, flip, sliceSorted and exact distance for each axis, then the corner permutation.
const TWIST = 0;
const FLIP = 3;
const SLICE = 6;
const DIST = 9;
const CORNERS = 12;
const FRAME = 13;

/** Exact distance after a move, from the distance before it and the stored distance mod 3. */
const NEXT_DISTANCE = Int8Array.from({ length: (MAX_DEPTH + 2) * 3 }, (_, i) => {
  const before = Math.floor(i / 3);
  const step = (i % 3) - (before % 3);
  return before + (step === 2 ? -1 : step === -2 ? 1 : step);
});

/** The parts of the tables a search reads; helpers get exactly these. */
export type SearchTables = Pick<
  OptimalTables,
  | 'twistConj'
  | 'prune'
  | 'cornerDepth'
  | 'twistMove'
  | 'flipMove'
  | 'sliceSortedMove'
  | 'cornerPermMove'
> & { readonly classes: Pick<FlipSliceClasses, 'classOf' | 'sorted'> };

function lookups(tables: SearchTables) {
  const { classes, twistConj, prune, twistMove, flipMove, sliceSortedMove } = tables;
  const { classOf, sorted } = classes;

  const entry = (twist: number, flip: number, sliceSorted: number) => {
    const slice = sorted ? sliceSorted : SLICE_OF_SORTED[sliceSorted];
    const packed = classOf[slice * N_FLIP + flip];
    return (packed >>> 4) * N_TWIST + twistConj[twist * N_SYM + (packed & 15)];
  };
  const stored = (index: number) => (prune[index >>> 4] >>> ((index & 15) << 1)) & 3;
  const inTarget = (twist: number, flip: number, sliceSorted: number) =>
    twist === 0 && flip === 0 && (sorted ? sliceSorted : SLICE_OF_SORTED[sliceSorted]) === 0;

  /** Walks down the table to the subgroup: each step finds a neighbour one closer. */
  function exactDistance(twist: number, flip: number, sliceSorted: number): number {
    let distance = 0;
    while (!inTarget(twist, flip, sliceSorted)) {
      const closer = (stored(entry(twist, flip, sliceSorted)) + 2) % 3;
      let m = 0;
      for (; m < N_MOVES; m++) {
        const t = twistMove[twist * N_MOVES + m];
        const f = flipMove[flip * N_MOVES + m];
        const s = sliceSortedMove[sliceSorted * N_MOVES + m];
        if (stored(entry(t, f, s)) === closer) {
          twist = t;
          flip = f;
          sliceSorted = s;
          break;
        }
      }
      if (m === N_MOVES) throw new Error('The optimal prune table is inconsistent');
      distance++;
    }
    return distance;
  }
  return { exactDistance };
}

interface AxisStart {
  readonly twist: number;
  readonly flip: number;
  readonly sliceSorted: number;
  readonly distance: number;
}

function axisStarts(cube: CubieCube, exactDistance: (t: number, f: number, s: number) => number) {
  return AXES.map((rotations): AxisStart => {
    let c = cube;
    for (const r of rotations) c = rotateCube(c, r.axis, r.turns);
    const twist = getTwist(c.co);
    const flip = getFlip(c.eo);
    const sliceSorted = getSliceSorted(c.ep);
    return { twist, flip, sliceSorted, distance: exactDistance(twist, flip, sliceSorted) };
  });
}

/**
 * Exact distances from the cube to the table's subgroup along the U/D, R/L and F/B axes: the
 * search's starting bounds.
 */
export function axisDistances(tables: OptimalTables, cube: CubieCube): number[] {
  return axisStarts(cube, lookups(tables).exactDistance).map((start) => start.distance);
}

/**
 * The search's first bound: the largest axis distance, one more when all three are equal and
 * non-zero (see the search), and the corners' distance.
 */
function firstBound(distances: readonly number[], cornerDistance: number): number {
  const [ud = 0, rl = 0, fb = 0] = distances;
  const allEqual = ud !== 0 && ud === rl && ud === fb;
  return Math.max(ud + (allEqual ? 1 : 0), rl, fb, cornerDistance);
}

/** No solution is shorter than this. */
export function optimalLowerBound(tables: OptimalTables, cube: CubieCube): number {
  return firstBound(axisDistances(tables, cube), tables.cornerDepth[getCornerPerm(cube.cp)]);
}

/**
 * The IDA* machinery of one thread: a stack of search states (one frame per depth) and the moves
 * that led to them. The sequential solver drives it alone; the parallel one gives each worker one.
 */
export interface Searcher {
  readonly state: Int32Array;
  readonly path: Uint8Array;
  /** Nodes generated so far: moves tried, as Kociemba's solver counts them. */
  readonly nodes: number;
  /** Fills frame 0 from a cube and returns the first bound. */
  setRoot(cube: CubieCube): number;
  /** Fills frame 0 from another searcher's frame 0. */
  copyRoot(frame: Int32Array): void;
  /** Applies move m to frame `depth` if every bound of the result stays below `togo`. */
  descend(depth: number, togo: number, m: number): boolean;
  /** Searches below frame `depth` with `togo` moves left, after a move on `lastFace`. */
  search(depth: number, togo: number, lastFace: number): Outcome;
}

/**
 * IDA* with Reid's heuristic: the largest of the three axis distances to the phase 1 subgroup
 * (or the smaller subgroup of the huge table) and the corners' distance, as in Kociemba's
 * optimal solver (solver.py of RubiksCube-OptimalSolver). `check` is polled every 2^20 nodes and
 * stops the search by returning true.
 */
export function createSearcher(tables: SearchTables, check: () => boolean): Searcher {
  const { classes, twistConj, prune, cornerDepth, twistMove, flipMove, sliceSortedMove } = tables;
  const { classOf, sorted } = classes;
  const { cornerPermMove } = tables;
  const { exactDistance } = lookups(tables);
  const state = new Int32Array((MAX_DEPTH + 1) * FRAME);
  const path = new Uint8Array(MAX_DEPTH);
  let nodes = 0;

  function descend(depth: number, togo: number, m: number): boolean {
    const at = depth * FRAME;
    const to = at + FRAME;
    const corners = cornerPermMove[state[at + CORNERS] * N_MOVES + m];
    if (cornerDepth[corners] >= togo) return false;
    for (let axis = 0; axis < 3; axis++) {
      const ma = moveOnAxis[axis * N_MOVES + m];
      const t = twistMove[state[at + TWIST + axis] * N_MOVES + ma];
      const f = flipMove[state[at + FLIP + axis] * N_MOVES + ma];
      const s = sliceSortedMove[state[at + SLICE + axis] * N_MOVES + ma];
      const packed = classOf[(sorted ? s : SLICE_OF_SORTED[s]) * N_FLIP + f];
      const index = (packed >>> 4) * N_TWIST + twistConj[t * N_SYM + (packed & 15)];
      const mod3 = (prune[index >>> 4] >>> ((index & 15) << 1)) & 3;
      const distance = NEXT_DISTANCE[state[at + DIST + axis] * 3 + mod3];
      if (distance >= togo) return false;
      state[to + TWIST + axis] = t;
      state[to + FLIP + axis] = f;
      state[to + SLICE + axis] = s;
      state[to + DIST + axis] = distance;
    }
    // Equal non-zero distances d on all three axes mean at least d + 1 moves: a solution of
    // exactly d moves would reach all three subgroups only with its last move, but the state
    // before that move is one face turn from solved and so already in the subgroup of that
    // turn's axis. Kociemba's solver.py applies the same rule.
    const d = state[to + DIST];
    if (d !== 0 && d === state[to + DIST + 1] && d === state[to + DIST + 2] && d + 1 >= togo) {
      return false;
    }
    state[to + CORNERS] = corners;
    return true;
  }

  // A node is only entered if all its bounds are below `togo`, so at togo = 0 all three subgroups
  // are reached: oriented, every edge in its slice. Solved if the slices are in order and the
  // corners in place.
  function search(depth: number, togo: number, lastFace: number): Outcome {
    if (togo === 0) {
      const at = depth * FRAME;
      const solved =
        state[at + CORNERS] === 0 &&
        state[at + SLICE] === 0 &&
        state[at + SLICE + 1] === 0 &&
        state[at + SLICE + 2] === 0;
      return solved ? FOUND : NONE;
    }
    for (let m = 0; m < N_MOVES; m++) {
      const face = (m / 3) | 0;
      const diff = lastFace - face;
      if (diff === 0 || diff === 3) continue;
      if (++nodes % CHECK_INTERVAL === 0 && check()) return STOPPED;
      if (!descend(depth, togo, m)) continue;
      path[depth] = m;
      const outcome = search(depth + 1, togo - 1, face);
      if (outcome !== NONE) return outcome;
    }
    return NONE;
  }

  return {
    state,
    path,
    get nodes() {
      return nodes;
    },
    setRoot(cube) {
      axisStarts(cube, exactDistance).forEach((start, axis) => {
        state[TWIST + axis] = start.twist;
        state[FLIP + axis] = start.flip;
        state[SLICE + axis] = start.sliceSorted;
        state[DIST + axis] = start.distance;
      });
      state[CORNERS] = getCornerPerm(cube.cp);
      return firstBound(
        [state[DIST], state[DIST + 1], state[DIST + 2]],
        cornerDepth[state[CORNERS]],
      );
    },
    copyRoot(frame) {
      state.set(frame.subarray(0, FRAME));
    },
    descend,
    search,
  };
}

/** The sequential optimal solver. */
export function createOptimalSolver(tables: OptimalTables): OptimalSolve {
  return function solve(cube, options = {}) {
    const { shouldStop, onProgress, upperBound } = options;
    const begin = performance.now();
    const depths: DepthStats[] = [];
    let cancelled = false;
    let bound = 0;

    /** Reports progress and returns whether to stop. */
    const check = (): boolean => {
      onProgress?.({ depth: bound, nodes: searcher.nodes, elapsedMs: performance.now() - begin });
      if (shouldStop?.() === true) cancelled = true;
      return cancelled;
    };
    const searcher = createSearcher(tables, check);
    bound = searcher.setRoot(cube);

    const result = (
      moves: readonly FaceTurn[] | undefined,
      provedBound = false,
    ): OptimalResult => ({
      moves,
      cancelled,
      provedBound,
      nodes: searcher.nodes,
      elapsedMs: performance.now() - begin,
      depths,
    });

    for (; bound <= MAX_DEPTH; bound++) {
      if (upperBound !== undefined && bound >= upperBound.length) return result(upperBound, true);
      if (check()) return result(undefined);
      const nodesBefore = searcher.nodes;
      const start = performance.now();
      const outcome = searcher.search(0, bound, -1);
      if (outcome === STOPPED) return result(undefined);
      depths.push({
        depth: bound,
        nodes: searcher.nodes - nodesBefore,
        ms: performance.now() - start,
      });
      if (outcome === FOUND) {
        return result(Array.from(searcher.path.subarray(0, bound), (m) => FACE_TURNS[m]));
      }
    }
    throw new Error(`No solution within ${String(MAX_DEPTH)} moves`);
  };
}
