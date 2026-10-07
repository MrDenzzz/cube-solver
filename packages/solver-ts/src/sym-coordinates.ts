import {
  getFlip,
  getSliceSorted,
  N_FLIP,
  N_SLICE,
  N_SLICE_SORTED,
  setFlip,
  setSliceSorted,
} from './coordinates.ts';
import { conjugateEdges, INVERSE_SYM, N_SYM } from './symmetry.ts';

/**
 * Symmetry classes of the combined edge coordinate of phase 1, flip · slice positions
 * ("FlipUDSlice"), or of flip · slice positions and order ("FlipUDSliceSorted") for the larger
 * table. Conjugating by a symmetry of D4h does not change how far a state is from the phase 1
 * subgroup, so a table needs one entry per class instead of one per value.
 */
export interface FlipSliceClasses {
  /** Whether the slice part keeps the order of the slice edges. */
  readonly sorted: boolean;
  readonly count: number;
  /**
   * For each raw value (slice · 2048 + flip): its class << 4 | a symmetry s that conjugates the
   * value to the class representative.
   */
  readonly classOf: Uint32Array;
  /** Raw value of each class's representative, the smallest in the class. */
  readonly representative: Uint32Array;
  /** Bit mask of the symmetries that leave the representative unchanged (bit 0: identity). */
  readonly stabilizer: Uint16Array;
}

const UNASSIGNED = 0xffffffff;

/** Published class counts (Kociemba, defs.py of RubiksCube-OptimalSolver), checked on build. */
export const N_FLIPSLICE_CLASS = 64_430;
export const N_FLIPSLICESORTED_CLASS = 1_523_864;

export function flipSliceSize(sorted: boolean): number {
  return (sorted ? N_SLICE_SORTED : N_SLICE) * N_FLIP;
}

/** With `shared`, the large class index lives in a SharedArrayBuffer for parallel search. */
export function buildFlipSliceClasses(sorted: boolean, shared = false): FlipSliceClasses {
  const size = flipSliceSize(sorted);
  const expected = sorted ? N_FLIPSLICESORTED_CLASS : N_FLIPSLICE_CLASS;
  const classOf = (
    shared ? new Uint32Array(new SharedArrayBuffer(size * 4)) : new Uint32Array(size)
  ).fill(UNASSIGNED);
  const representative = new Uint32Array(expected);
  const stabilizer = new Uint16Array(expected);
  const ep = new Uint8Array(12);
  const eo = new Uint8Array(12);
  const conjEp = new Uint8Array(12);
  const conjEo = new Uint8Array(12);
  let count = 0;
  for (let raw = 0; raw < size; raw++) {
    if (classOf[raw] !== UNASSIGNED) continue;
    if (count === expected) throw new Error(`More than ${String(expected)} flip-slice classes`);
    const slice = Math.floor(raw / N_FLIP);
    setSliceSorted(sorted ? slice : slice * 24, ep);
    setFlip(raw % N_FLIP, eo);
    let stable = 0;
    for (let s = 0; s < N_SYM; s++) {
      conjugateEdges(s, ep, eo, conjEp, conjEo);
      const sliceSorted = getSliceSorted(conjEp);
      const image =
        (sorted ? sliceSorted : Math.floor(sliceSorted / 24)) * N_FLIP + getFlip(conjEo);
      if (image === raw) stable |= 1 << s;
      // The image is s(representative), so s⁻¹ takes it back.
      if (classOf[image] === UNASSIGNED) classOf[image] = (count << 4) | INVERSE_SYM[s];
    }
    representative[count] = raw;
    stabilizer[count] = stable;
    count++;
  }
  if (count !== expected)
    throw new Error(`Found ${String(count)} classes, not ${String(expected)}`);
  return { sorted, count, classOf, representative, stabilizer };
}
