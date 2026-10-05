import {
  FACE_TURNS,
  inverse,
  inverseTurns,
  invertFaceTurns,
  rotateCube,
  rotateFace,
  type CubieCube,
  type Face,
  type FaceTurn,
  type Turns,
} from '@cube/core';
import {
  getCornerPerm,
  getDEdges,
  getFlip,
  getSlice,
  getSliceSorted,
  getTwist,
  getUEdges,
  N_FLIP,
  N_SLICE_PERM,
  N_TWIST,
} from './coordinates.ts';
import { N_MOVES, PHASE2_MOVES, type TwoPhaseTables } from './tables.ts';

export interface TwoPhaseOptions {
  /** Stop as soon as a solution of at most this many moves is found. */
  readonly maxLength?: number;
  /** After this, return the best solution so far; the search goes on until there is one. */
  readonly timeLimitMs?: number;
  /** Polled during the search; returning true abandons it, even without a solution. */
  readonly shouldStop?: () => boolean;
  /** Called about every thousand phase 1 nodes; throttle before doing anything costly. */
  readonly onProgress?: (progress: TwoPhaseProgress) => void;
  /** Called with each solution that is shorter than all found before it. */
  readonly onImprovement?: (moves: readonly FaceTurn[]) => void;
  /**
   * 1 searches the cube as given; 6 also searches it rotated 120° and 240° about the URF–DBL
   * diagonal and the inverses of all three, interleaved by phase 1 depth.
   */
  readonly directions?: 1 | 6;
}

export type StopReason = 'target' | 'time' | 'cancelled' | 'exhausted';

export interface TwoPhaseProgress {
  /** Phase 1 depth being explored. */
  readonly depth: number;
  readonly bestLength: number | undefined;
  readonly nodes: number;
  readonly elapsedMs: number;
}

export interface TwoPhaseStats {
  readonly phase1Nodes: number;
  readonly phase2Nodes: number;
  /** Phase 1 paths that reached G1 and were handed to phase 2. */
  readonly phase1Solutions: number;
  readonly elapsedMs: number;
}

export interface TwoPhaseResult {
  /** The shortest solution found, or undefined if the search was cancelled before the first. */
  readonly moves: readonly FaceTurn[] | undefined;
  readonly stoppedBy: StopReason;
  readonly stats: TwoPhaseStats;
}

export type TwoPhaseSolve = (cube: CubieCube, options?: TwoPhaseOptions) => TwoPhaseResult;

// Both limits follow Kociemba's solver.py: phase 1 is deepened up to 19 moves, and phase 2 never
// uses more than 10, because long phase 2 completions are better found through a longer phase 1.
const PHASE1_DEPTH_LIMIT = 20;
const PHASE2_MOVE_LIMIT = 10;
const CHECK_INTERVAL = 1024;

const IS_PHASE2_MOVE = new Uint8Array(N_MOVES);
for (const m of PHASE2_MOVES) IS_PHASE2_MOVE[m] = 1;

interface Rotation {
  readonly axis: Face;
  readonly turns: Turns;
}

/** x then y: a 120° turn about the URF–DBL diagonal, taking the U/D axis to R/L and then F/B. */
const DIAGONAL: readonly Rotation[] = [
  { axis: 'R', turns: 1 },
  { axis: 'U', turns: 1 },
];

interface Direction {
  readonly rotations: readonly Rotation[];
  readonly inverted: boolean;
}

const DIRECTIONS: readonly Direction[] = [0, 1, 2].flatMap((times) => {
  const rotations = Array.from({ length: times }, () => DIAGONAL).flat();
  return [
    { rotations, inverted: false },
    { rotations, inverted: true },
  ];
});

interface Start {
  readonly direction: Direction;
  readonly twist: number;
  readonly flip: number;
  readonly slice: number;
  readonly h: number;
  readonly sliceSorted: number;
  readonly corners: number;
  readonly uEdges: number;
  readonly dEdges: number;
}

/** Turns a solution found for a direction's cube into one for the original cube. */
function toOriginal(path: readonly number[], direction: Direction): FaceTurn[] {
  let moves = path.map((m) => FACE_TURNS[m]);
  if (direction.inverted) moves = invertFaceTurns(moves);
  return moves.map(({ face, turns }) => ({
    face: direction.rotations.reduceRight(
      (f, r) => rotateFace(f, r.axis, inverseTurns(r.turns)),
      face,
    ),
    turns,
  }));
}

/**
 * Kociemba's two-phase search (https://kociemba.org/math/imptwophase.htm, solver.py of
 * RubiksCube-TwophaseSolver): IDA* to G1 = <U, D, R2, L2, F2, B2>, then IDA* inside G1, going on
 * with longer phase 1 paths while that can still shorten the total.
 */
export function createTwoPhaseSolver(tables: TwoPhaseTables): TwoPhaseSolve {
  const {
    twistMove,
    flipMove,
    sliceMove,
    sliceSortedMove,
    uEdgesMove,
    dEdgesMove,
    cornerPermMove,
    udEdgePermMove,
    udEdgesFromGroups,
    sliceTwistPrune,
    sliceFlipPrune,
    twistFlipPrune,
    cornerSlicePrune,
    udEdgeSlicePrune,
  } = tables;

  const phase1Heuristic = (twist: number, flip: number, slice: number) => {
    const ht = sliceTwistPrune[slice * N_TWIST + twist];
    const hf = sliceFlipPrune[slice * N_FLIP + flip];
    const hx = twistFlipPrune[twist * N_FLIP + flip];
    const h2 = ht > hf ? ht : hf;
    return h2 > hx ? h2 : hx;
  };

  function startOf(cube: CubieCube, direction: Direction): Start {
    let c = cube;
    for (const r of direction.rotations) c = rotateCube(c, r.axis, r.turns);
    if (direction.inverted) c = inverse(c);
    const twist = getTwist(c.co);
    const flip = getFlip(c.eo);
    const slice = getSlice(c.ep);
    return {
      direction,
      twist,
      flip,
      slice,
      h: phase1Heuristic(twist, flip, slice),
      sliceSorted: getSliceSorted(c.ep),
      corners: getCornerPerm(c.cp),
      uEdges: getUEdges(c.ep),
      dEdges: getDEdges(c.ep),
    };
  }

  return function solve(cube, options = {}) {
    const maxLength = options.maxLength ?? 20;
    const timeLimitMs = options.timeLimitMs ?? Number.POSITIVE_INFINITY;
    const { shouldStop, onProgress, onImprovement } = options;
    const begin = performance.now();

    const starts = DIRECTIONS.slice(0, options.directions ?? 6).map((d) => startOf(cube, d));
    let current = starts[0];
    let currentDepth = 0;

    const path = new Int8Array(PHASE1_DEPTH_LIMIT + PHASE2_MOVE_LIMIT);
    let best: { path: number[]; direction: Direction } | undefined;
    let bestLength = Number.POSITIVE_INFINITY;
    let stoppedBy: StopReason | undefined;
    let phase1Nodes = 0;
    let phase2Nodes = 0;
    let phase1Solutions = 0;

    function checkStop(): void {
      const elapsedMs = performance.now() - begin;
      onProgress?.({
        depth: currentDepth,
        bestLength: best === undefined ? undefined : bestLength,
        nodes: phase1Nodes + phase2Nodes,
        elapsedMs,
      });
      if (shouldStop?.() === true) stoppedBy = 'cancelled';
      else if (best !== undefined && elapsedMs > timeLimitMs) stoppedBy = 'time';
    }

    // A node is only entered when its heuristic is below `togo`, so togo = 0 means solved.
    function phase2(
      corners: number,
      udEdges: number,
      slice: number,
      togo: number,
      lastFace: number,
      depth: number,
    ): boolean {
      if (togo === 0) return true;
      for (const m of PHASE2_MOVES) {
        const face = (m / 3) | 0;
        const diff = lastFace - face;
        if (diff === 0 || diff === 3) continue;
        phase2Nodes++;
        const c = cornerPermMove[corners * N_MOVES + m];
        const u = udEdgePermMove[udEdges * N_MOVES + m];
        const s = sliceSortedMove[slice * N_MOVES + m];
        const hc = cornerSlicePrune[c * N_SLICE_PERM + s];
        const hu = udEdgeSlicePrune[u * N_SLICE_PERM + s];
        if ((hc > hu ? hc : hu) >= togo) continue;
        path[depth] = m;
        if (phase2(c, u, s, togo - 1, face, depth + 1)) return true;
      }
      return false;
    }

    // Phase 2 coordinates are replayed along the path only at phase 1 solutions, which are far
    // rarer than phase 1 nodes.
    function phase1Solved(length: number, lastFace: number): void {
      phase1Solutions++;
      let corners = current.corners;
      let slice = current.sliceSorted;
      let uEdges = current.uEdges;
      let dEdges = current.dEdges;
      for (let i = 0; i < length; i++) {
        const m = path[i];
        corners = cornerPermMove[corners * N_MOVES + m];
        slice = sliceSortedMove[slice * N_MOVES + m];
        uEdges = uEdgesMove[uEdges * N_MOVES + m];
        dEdges = dEdgesMove[dEdges * N_MOVES + m];
      }
      const limit = Math.min(bestLength - length, PHASE2_MOVE_LIMIT + 1);
      const hc = cornerSlicePrune[corners * N_SLICE_PERM + slice];
      if (hc >= limit) return;
      const udEdges = udEdgesFromGroups[uEdges * 24 + (dEdges % 24)];
      const hu = udEdgeSlicePrune[udEdges * N_SLICE_PERM + slice];
      for (let togo = hc > hu ? hc : hu; togo < limit; togo++) {
        if (phase2(corners, udEdges, slice, togo, lastFace, length)) {
          bestLength = length + togo;
          best = { path: Array.from(path.subarray(0, bestLength)), direction: current.direction };
          onImprovement?.(toOriginal(best.path, best.direction));
          if (bestLength <= maxLength) stoppedBy = 'target';
          return;
        }
      }
    }

    function phase1(
      twist: number,
      flip: number,
      slice: number,
      h: number,
      togo: number,
      lastFace: number,
      depth: number,
    ): void {
      if (togo === 0) {
        phase1Solved(depth, lastFace);
        if (stoppedBy === undefined) checkStop();
        return;
      }
      if (++phase1Nodes % CHECK_INTERVAL === 0) checkStop();
      for (let m = 0; m < N_MOVES; m++) {
        const face = (m / 3) | 0;
        const diff = lastFace - face;
        if (diff === 0 || diff === 3) continue;
        // Already in G1 with few moves left: the rest is phase 2's job (Kociemba, solver.py).
        if (h === 0 && togo < 5 && IS_PHASE2_MOVE[m] === 1) continue;
        const t = twistMove[twist * N_MOVES + m];
        const f = flipMove[flip * N_MOVES + m];
        const s = sliceMove[slice * N_MOVES + m];
        const next = phase1Heuristic(t, f, s);
        if (next >= togo) continue;
        path[depth] = m;
        phase1(t, f, s, next, togo - 1, face, depth + 1);
        if (stoppedBy !== undefined) return;
      }
    }

    // Every direction gets depth d before any gets d + 1, so the first short phase 1 found in any
    // direction bounds all the others.
    const minDepth = Math.min(...starts.map((s) => s.h));
    search: for (let depth = minDepth; depth < PHASE1_DEPTH_LIMIT; depth++) {
      for (const start of starts) {
        if (depth >= bestLength) break search;
        if (start.h > depth) continue;
        current = start;
        currentDepth = depth;
        phase1(start.twist, start.flip, start.slice, start.h, depth, -1, 0);
        if (stoppedBy !== undefined) break search;
      }
    }

    return {
      moves: best === undefined ? undefined : toOriginal(best.path, best.direction),
      stoppedBy: stoppedBy ?? 'exhausted',
      stats: { phase1Nodes, phase2Nodes, phase1Solutions, elapsedMs: performance.now() - begin },
    };
  };
}
