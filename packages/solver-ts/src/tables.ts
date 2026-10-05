import { MOVE_CUBES } from '@cube/core';
import {
  getCornerPerm,
  getDEdges,
  getFlip,
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
  N_U_EDGES_IN_G1,
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
import { unrankPermutation } from './math.ts';

export const N_MOVES = 18;

/** Moves of G1 = <U, D, R2, L2, F2, B2> as indices into the 18 face turns. */
export const PHASE2_MOVES: readonly number[] = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16];

const ALL_MOVES: readonly number[] = Array.from({ length: N_MOVES }, (_, m) => m);

const UNVISITED = 255;

function moveCorners(
  cp: Uint8Array,
  co: Uint8Array,
  move: number,
  outCp: Uint8Array,
  outCo: Uint8Array,
) {
  const m = MOVE_CUBES[move];
  for (let i = 0; i < 8; i++) {
    outCp[i] = cp[m.cp[i]];
    outCo[i] = (co[m.cp[i]] + m.co[i]) % 3;
  }
}

function moveEdges(
  ep: Uint8Array,
  eo: Uint8Array,
  move: number,
  outEp: Uint8Array,
  outEo: Uint8Array,
) {
  const m = MOVE_CUBES[move];
  for (let i = 0; i < 12; i++) {
    outEp[i] = ep[m.ep[i]];
    outEo[i] = (eo[m.ep[i]] + m.eo[i]) % 2;
  }
}

/**
 * table[coordinate · 18 + move] = coordinate after the move; moves outside `moves` stay 0.
 * Each coordinate is decoded into pieces once and then moved 18 times.
 */
function moveTable(
  size: number,
  moves: readonly number[],
  pieceCount: 8 | 12,
  set: (v: number, perm: Uint8Array, ori: Uint8Array) => void,
  get: (perm: Uint8Array, ori: Uint8Array) => number,
): Uint16Array {
  const apply = pieceCount === 8 ? moveCorners : moveEdges;
  const identity = Array.from({ length: pieceCount }, (_, i) => i);
  const perm = new Uint8Array(pieceCount);
  const ori = new Uint8Array(pieceCount);
  const nextPerm = new Uint8Array(pieceCount);
  const nextOri = new Uint8Array(pieceCount);
  const table = new Uint16Array(size * N_MOVES);
  for (let c = 0; c < size; c++) {
    perm.set(identity);
    ori.fill(0);
    set(c, perm, ori);
    for (const m of moves) {
      apply(perm, ori, m, nextPerm, nextOri);
      table[c * N_MOVES + m] = get(nextPerm, nextOri);
    }
  }
  return table;
}

const cornerMoveTable = (
  size: number,
  set: (v: number, cp: Uint8Array, co: Uint8Array) => void,
  get: (cp: Uint8Array, co: Uint8Array) => number,
) => moveTable(size, ALL_MOVES, 8, set, get);

const edgeMoveTable = (
  size: number,
  set: (v: number, ep: Uint8Array, eo: Uint8Array) => void,
  get: (ep: Uint8Array, eo: Uint8Array) => number,
  moves: readonly number[] = ALL_MOVES,
) => moveTable(size, moves, 12, set, get);

/**
 * Exact distances in the product of two coordinates, by breadth-first search from the solved
 * pair (0, 0). Entry a · sizeB + b holds the minimum number of `moves` that bring both to 0.
 */
function pruningTable(
  sizeA: number,
  moveA: Uint16Array,
  sizeB: number,
  moveB: Uint16Array,
  moves: readonly number[],
): Uint8Array {
  const total = sizeA * sizeB;
  const depth = new Uint8Array(total).fill(UNVISITED);
  const moveList = Int8Array.from(moves);
  const moveCount = moveList.length;
  depth[0] = 0;
  let visited = 1;
  // Level by level. Once most entries are known, it is cheaper to ask each unvisited entry whether
  // a neighbour is on the current level (stopping at the first) than to expand the whole level,
  // as Kociemba's pruning.py does. Valid because the move set is closed under inverses.
  for (let level = 0; visited < total; level++) {
    const backward = visited > total / 2;
    const next = level + 1;
    let found = 0;
    for (let a = 0; a < sizeA; a++) {
      const rowA = a * N_MOVES;
      for (let b = 0; b < sizeB; b++) {
        const index = a * sizeB + b;
        const rowB = b * N_MOVES;
        if (backward) {
          if (depth[index] !== UNVISITED) continue;
          for (let i = 0; i < moveCount; i++) {
            const m = moveList[i];
            if (depth[moveA[rowA + m] * sizeB + moveB[rowB + m]] === level) {
              depth[index] = next;
              found++;
              break;
            }
          }
        } else {
          if (depth[index] !== level) continue;
          for (let i = 0; i < moveCount; i++) {
            const m = moveList[i];
            const target = moveA[rowA + m] * sizeB + moveB[rowB + m];
            if (depth[target] === UNVISITED) {
              depth[target] = next;
              found++;
            }
          }
        }
      }
    }
    if (found === 0) {
      throw new Error(`Pruning table reached ${String(visited)} of ${String(total)} entries`);
    }
    visited += found;
  }
  return depth;
}

export interface TwoPhaseTables {
  readonly twistMove: Uint16Array;
  readonly flipMove: Uint16Array;
  readonly sliceMove: Uint16Array;
  readonly sliceSortedMove: Uint16Array;
  readonly uEdgesMove: Uint16Array;
  readonly dEdgesMove: Uint16Array;
  readonly cornerPermMove: Uint16Array;
  readonly udEdgePermMove: Uint16Array;
  /** udEdgePerm in G1 from (uEdges < 1680) · 24 + (dEdges mod 24). */
  readonly udEdgesFromGroups: Uint16Array;
  readonly sliceTwistPrune: Uint8Array;
  readonly sliceFlipPrune: Uint8Array;
  readonly twistFlipPrune: Uint8Array;
  readonly cornerSlicePrune: Uint8Array;
  readonly udEdgeSlicePrune: Uint8Array;
}

export interface TableBuildStep {
  readonly name: keyof TwoPhaseTables;
  readonly bytes: number;
  readonly ms: number;
}

export function buildTwoPhaseTables(onStep?: (step: TableBuildStep) => void): TwoPhaseTables {
  function step<T extends Uint8Array | Uint16Array>(name: keyof TwoPhaseTables, build: () => T): T {
    const start = performance.now();
    const table = build();
    onStep?.({ name, bytes: table.byteLength, ms: performance.now() - start });
    return table;
  }

  const twistMove = step('twistMove', () =>
    cornerMoveTable(
      N_TWIST,
      (v, _cp, co) => {
        setTwist(v, co);
      },
      (_cp, co) => getTwist(co),
    ),
  );
  const flipMove = step('flipMove', () =>
    edgeMoveTable(
      N_FLIP,
      (v, _ep, eo) => {
        setFlip(v, eo);
      },
      (_ep, eo) => getFlip(eo),
    ),
  );
  const sliceSortedMove = step('sliceSortedMove', () =>
    edgeMoveTable(N_SLICE_SORTED, setSliceSorted, getSliceSorted),
  );
  // Slice positions move independently of the slice edges' order, so read them off sliceSorted.
  const sliceMove = step('sliceMove', () => {
    const table = new Uint16Array(N_SLICE * N_MOVES);
    for (let c = 0; c < N_SLICE; c++) {
      for (let m = 0; m < N_MOVES; m++) {
        table[c * N_MOVES + m] = Math.floor(sliceSortedMove[c * 24 * N_MOVES + m] / 24);
      }
    }
    return table;
  });
  const uEdgesMove = step('uEdgesMove', () => edgeMoveTable(N_UD_EDGE_GROUP, setUEdges, getUEdges));
  const dEdgesMove = step('dEdgesMove', () => edgeMoveTable(N_UD_EDGE_GROUP, setDEdges, getDEdges));
  const cornerPermMove = step('cornerPermMove', () =>
    cornerMoveTable(N_CORNER_PERM, setCornerPerm, getCornerPerm),
  );
  const udEdgePermMove = step('udEdgePermMove', () =>
    edgeMoveTable(N_UD_EDGE_PERM, setUDEdgePerm, getUDEdgePerm, PHASE2_MOVES),
  );
  // In G1 the U edges sit in positions 0..7 (uEdges < 1680) and the D edges fill the other four,
  // so the U-edge coordinate plus the order of the D edges determine the whole 8-edge permutation.
  const udEdgesFromGroups = step('udEdgesFromGroups', () => {
    const table = new Uint16Array(N_U_EDGES_IN_G1 * 24);
    const ep = new Uint8Array(12);
    const dOrder = new Uint8Array(4);
    for (let u = 0; u < N_U_EDGES_IN_G1; u++) {
      for (let d = 0; d < 24; d++) {
        setUEdges(u, ep);
        unrankPermutation(d, 4, dOrder);
        let k = 0;
        for (let p = 0; p < 8; p++) if (ep[p] >= 4) ep[p] = 4 + dOrder[k++];
        table[u * 24 + d] = getUDEdgePerm(ep);
      }
    }
    return table;
  });

  const sliceTwistPrune = step('sliceTwistPrune', () =>
    pruningTable(N_SLICE, sliceMove, N_TWIST, twistMove, ALL_MOVES),
  );
  const sliceFlipPrune = step('sliceFlipPrune', () =>
    pruningTable(N_SLICE, sliceMove, N_FLIP, flipMove, ALL_MOVES),
  );
  const twistFlipPrune = step('twistFlipPrune', () =>
    pruningTable(N_TWIST, twistMove, N_FLIP, flipMove, ALL_MOVES),
  );
  const cornerSlicePrune = step('cornerSlicePrune', () =>
    pruningTable(N_CORNER_PERM, cornerPermMove, N_SLICE_PERM, sliceSortedMove, PHASE2_MOVES),
  );
  const udEdgeSlicePrune = step('udEdgeSlicePrune', () =>
    pruningTable(N_UD_EDGE_PERM, udEdgePermMove, N_SLICE_PERM, sliceSortedMove, PHASE2_MOVES),
  );

  return {
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
  };
}
