import type { CubieCube } from './cubie.ts';
import { parseFacelets, toFacelets } from './facelets.ts';
import {
  faceNormal,
  faceWithNormal,
  layerTurnPermutation,
  permute,
  rotateTurns,
  type Face,
} from './geometry.ts';
import type { Turns } from './moves.ts';
import { symbols } from './util.ts';

/**
 * The same physical cube after a whole-cube rotation (x like R, y like U, z like F), described
 * relative to its centres again. Solving the result with move faces mapped back through
 * {@link rotateFace} solves the original: this is conjugation by the rotation.
 */
export function rotateCube(cube: CubieCube, axis: Face, turns: Turns): CubieCube {
  let facelets = symbols(toFacelets(cube));
  for (let layer = 1; layer <= 3; layer++) {
    facelets = permute(facelets, layerTurnPermutation(3, axis, layer, turns));
  }
  const parsed = parseFacelets(facelets);
  if (!parsed.ok) throw new Error('A whole-cube rotation produced an invalid state');
  return parsed.value;
}

/** The face position that `face` moves to under the rotation. */
export function rotateFace(face: Face, axis: Face, turns: Turns): Face {
  return faceWithNormal(rotateTurns(faceNormal(axis), faceNormal(face), turns));
}
