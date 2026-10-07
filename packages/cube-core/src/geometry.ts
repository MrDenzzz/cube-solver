import { at, symbols } from './util.ts';

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];

export type Vec3 = readonly [number, number, number];

interface FaceFrame {
  readonly normal: Vec3;
  readonly right: Vec3;
  readonly down: Vec3;
}

// x points to R, y to U, z to F. `right` and `down` give the reading order of the facelet string
// (Kociemba's layout): every face is read row by row as seen from outside, U and D with B and F
// at the top of the view respectively, the side faces with U at the top.
const FACE_FRAMES: Readonly<Record<Face, FaceFrame>> = {
  U: { normal: [0, 1, 0], right: [1, 0, 0], down: [0, 0, 1] },
  R: { normal: [1, 0, 0], right: [0, 0, -1], down: [0, -1, 0] },
  F: { normal: [0, 0, 1], right: [1, 0, 0], down: [0, -1, 0] },
  D: { normal: [0, -1, 0], right: [1, 0, 0], down: [0, 0, -1] },
  L: { normal: [-1, 0, 0], right: [0, 0, 1], down: [0, -1, 0] },
  B: { normal: [0, 0, -1], right: [-1, 0, 0], down: [0, -1, 0] },
};

export function isFace(value: string): value is Face {
  return (FACES as readonly string[]).includes(value);
}

export function facesOf(name: string): Face[] {
  return symbols(name).map((letter) => {
    if (!isFace(letter)) throw new RangeError(`"${letter}" in "${name}" is not a face`);
    return letter;
  });
}

export const OPPOSITE: Readonly<Record<Face, Face>> = {
  U: 'D',
  R: 'L',
  F: 'B',
  D: 'U',
  L: 'R',
  B: 'F',
};

/**
 * A sticker on an N×N×N cube. Cubie centres use odd integer coordinates in −(N−1)..N−1, so the
 * outer layer of a face lies at N−1 along its normal for every N.
 */
export interface Sticker {
  readonly position: Vec3;
  readonly normal: Vec3;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function add(...vectors: readonly Vec3[]): Vec3 {
  return vectors.reduce<Vec3>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
}

function scale(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function sameVector(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function faceNormal(face: Face): Vec3 {
  return FACE_FRAMES[face].normal;
}

export function faceWithNormal(normal: Vec3): Face {
  const face = FACES.find((f) => sameVector(FACE_FRAMES[f].normal, normal));
  if (face === undefined) throw new RangeError(`[${normal.join(', ')}] is not a face normal`);
  return face;
}

/** Quarter turn clockwise as seen from outside the face whose normal is `axis`. */
export function rotateClockwise(axis: Vec3, v: Vec3): Vec3 {
  // Rodrigues' formula for −90°: v' = a(a·v) − a×v.
  return add(scale(axis, dot(axis, v)), scale(cross(axis, v), -1));
}

export function rotateTurns(axis: Vec3, v: Vec3, turns: number): Vec3 {
  let result = v;
  for (let i = 0; i < turns; i++) result = rotateClockwise(axis, result);
  return result;
}

export function stickerCount(size: number): number {
  return 6 * size * size;
}

/** Facelet string of the solved N×N×N cube: each face's letter N² times, in face order. */
export function solvedFacelets(size: number): string {
  return FACES.map((face) => face.repeat(size * size)).join('');
}

export function stickerAt(size: number, facelet: number): Sticker {
  const perFace = size * size;
  const face = at(FACES, Math.floor(facelet / perFace));
  const row = Math.floor((facelet % perFace) / size);
  const column = facelet % size;
  const { normal, right, down } = FACE_FRAMES[face];
  return {
    position: add(
      scale(normal, size - 1),
      scale(right, 2 * column - (size - 1)),
      scale(down, 2 * row - (size - 1)),
    ),
    normal,
  };
}

export function faceletAt(size: number, sticker: Sticker): number {
  const face = faceWithNormal(sticker.normal);
  const { right, down } = FACE_FRAMES[face];
  const column = (dot(sticker.position, right) + size - 1) / 2;
  const row = (dot(sticker.position, down) + size - 1) / 2;
  return FACES.indexOf(face) * size * size + row * size + column;
}

/** Facelet index of the sticker on `face` of the cubie that touches all of `faces`. */
export function faceletOfCubie(size: number, face: Face, faces: readonly Face[]): number {
  const position = add(...faces.map((f) => scale(faceNormal(f), size - 1)));
  return faceletAt(size, { position, normal: faceNormal(face) });
}

/**
 * Facelet permutation of turning `layer` (1 = the outer layer of `face`) by `turns` clockwise
 * quarter turns as seen from outside `face`. The result maps each destination to its source:
 * after the turn, facelet i shows what facelet permutation[i] showed before.
 */
export function layerTurnPermutation(
  size: number,
  face: Face,
  layer: number,
  turns: number,
): number[] {
  const axis = faceNormal(face);
  const depth = size - 1 - 2 * (layer - 1);
  const permutation = Array.from({ length: stickerCount(size) }, (_, i) => i);
  for (let source = 0; source < permutation.length; source++) {
    const sticker = stickerAt(size, source);
    if (dot(sticker.position, axis) !== depth) continue;
    const target = faceletAt(size, {
      position: rotateTurns(axis, sticker.position, turns),
      normal: rotateTurns(axis, sticker.normal, turns),
    });
    permutation[target] = source;
  }
  return permutation;
}

export function permute<T>(items: readonly T[], permutation: readonly number[]): T[] {
  return permutation.map((source) => at(items, source));
}
