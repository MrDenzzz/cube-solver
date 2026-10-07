import {
  FACES,
  faceNormal,
  stickerAt,
  stickerCount,
  type Face,
  type LayerTurn,
  type Turns,
  type Vec3,
} from '@cube/core';

/** World units per grid unit: cubie centres are two grid units apart, so cubies are 1 unit wide. */
export const SPACING = 0.5;

export interface StickerModel {
  readonly facelet: number;
  readonly normal: Vec3;
}

/** A visible cubie: its centre in grid units (odd integers in −(N−1)..N−1) and its stickers. */
export interface CubieModel {
  readonly position: Vec3;
  readonly stickers: readonly StickerModel[];
}

/**
 * Cubies come from the same sticker geometry as the cube model in @cube/core, so what is drawn
 * cannot drift from what is solved, and any cube size works.
 */
export function buildCubies(size: number): CubieModel[] {
  const cubies = new Map<string, { position: Vec3; stickers: StickerModel[] }>();
  for (let facelet = 0; facelet < stickerCount(size); facelet++) {
    const { position, normal } = stickerAt(size, facelet);
    const key = position.join(',');
    const cubie = cubies.get(key) ?? { position, stickers: [] };
    cubie.stickers.push({ facelet, normal });
    cubies.set(key, cubie);
  }
  return [...cubies.values()];
}

/** Indices of the cubies in layers `from`..`to` of `face`, counted from the face (1 = outer). */
export function layerMembers(
  cubies: readonly CubieModel[],
  size: number,
  face: Face,
  from = 1,
  to = from,
): number[] {
  const [nx, ny, nz] = faceNormal(face);
  const members: number[] = [];
  cubies.forEach(({ position: [x, y, z] }, index) => {
    const layer = (size - 1 - (x * nx + y * ny + z * nz)) / 2 + 1;
    if (layer >= from && layer <= to) members.push(index);
  });
  return members;
}

/**
 * Rotation angle about the face's outward normal. Clockwise as seen from outside is negative by
 * the right-hand rule; a counter-clockwise quarter turn animates as +90° rather than −270°.
 */
export function turnAngle(turns: Turns): number {
  return turns === 3 ? Math.PI / 2 : (-Math.PI / 2) * turns;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** A flat arrow lying on a face, in grid units: where it sits, which way it points. */
export interface FaceArrow {
  readonly face: Face;
  readonly centre: Vec3;
  readonly direction: Vec3;
  readonly normal: Vec3;
  /** Half turns can go either way, so their arrows point both ways. */
  readonly twoWay: boolean;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Arrows along the strip a layer turn moves on each of the four faces around it. They show the
 * turn from any viewing angle, including turns of faces facing away from the camera.
 */
export function turnArrows(size: number, turn: LayerTurn): FaceArrow[] {
  const axis = faceNormal(turn.face);
  // Mean grid coordinate along the axis of the turning layers' cubie centres.
  const depth = size + 1 - turn.from - turn.to;
  // A clockwise turn about the outward normal `a` moves a point p with velocity −a × p.
  const sign = turn.turns === 3 ? 1 : -1;
  return FACES.flatMap((face) => {
    const normal = faceNormal(face);
    if (dot(normal, axis) !== 0) return [];
    const centre: Vec3 = [
      normal[0] * size + axis[0] * depth,
      normal[1] * size + axis[1] * depth,
      normal[2] * size + axis[2] * depth,
    ];
    // `+ 0` turns −0 into 0, so directions compare equal to plain unit vectors.
    const [x, y, z] = cross(axis, normal).map((v) => sign * v + 0) as [number, number, number];
    return [{ face, centre, direction: [x, y, z], normal, twoWay: turn.turns === 2 }];
  });
}
