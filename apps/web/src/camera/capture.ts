import { rotateGrid } from './placement.ts';
import type { CellColour } from './sample.ts';

// When to take a picture without a button: a face is found in the picture (see detect.ts) and
// holds still for a moment. A face already taken, seen again in any rotation, is not taken twice.

/** Readings in a row that must agree before a picture is taken: about 0.4 s at 8 a second. */
export const STEADY_READINGS = 3;
/** Mean colour difference (CIE76) between readings of a still face; the camera's noise stays well below. */
const STILL = 8;
/** Mean difference below which a face matches one already taken. */
const SAME_FACE = 12;

const difference = (a: readonly CellColour[], b: readonly CellColour[]) => {
  let sum = 0;
  a.forEach((cell, i) => {
    const other = b[i]?.lab ?? [0, 0, 0];
    sum += Math.hypot(cell.lab[0] - other[0], cell.lab[1] - other[1], cell.lab[2] - other[2]);
  });
  return sum / Math.max(1, a.length);
};

/** Index of a taken face that these cells show again, in any rotation, or -1. */
export function matchingFace(
  cells: readonly CellColour[],
  taken: readonly (readonly CellColour[])[],
  size: number,
): number {
  return taken.findIndex((face) =>
    [0, 1, 2, 3].some((t) => difference(rotateGrid(face, size, t), cells) < SAME_FACE),
  );
}

export interface Watch {
  readonly previous: readonly CellColour[] | null;
  readonly steady: number;
}

export const IDLE: Watch = { previous: null, steady: 0 };

export type Verdict = 'none' | 'steadying' | 'take' | 'taken-already';

/**
 * One reading of the camera, `cells` being the face found in it, if any: whether to take it now.
 * A face found turned by a quarter from the last reading reads differently, so it is matched in
 * every rotation.
 */
export function watch(
  state: Watch,
  cells: readonly CellColour[] | null,
  taken: readonly (readonly CellColour[])[],
  size: number,
): { readonly state: Watch; readonly verdict: Verdict } {
  if (cells === null) return { state: IDLE, verdict: 'none' };
  const previous = state.previous;
  const still =
    previous !== null &&
    [0, 1, 2, 3].some((t) => difference(rotateGrid(previous, size, t), cells) < STILL);
  const steady = still ? state.steady + 1 : 1;
  const next = { previous: cells, steady };
  if (steady < STEADY_READINGS) return { state: next, verdict: 'steadying' };
  if (matchingFace(cells, taken, size) !== -1) {
    return { state: next, verdict: 'taken-already' };
  }
  // Start over, so the same face is not taken again on the next reading.
  return { state: IDLE, verdict: 'take' };
}
