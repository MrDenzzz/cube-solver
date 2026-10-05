import { faceNormal, stickerAt, stickerCount, type Face, type Turns, type Vec3 } from '@cube/core';

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
