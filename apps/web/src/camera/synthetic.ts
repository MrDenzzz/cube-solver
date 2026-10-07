import type { Face } from '@cube/core';
import type { Pixels } from './sample.ts';

// Synthetic camera pictures of cube faces, for the tests and the end-to-end camera video. The
// colours are made up to look like stickers under warm indoor light, not measured.

export type Rgb = readonly [number, number, number];

export const SEEN: Readonly<Record<Face, Rgb>> = {
  U: [236, 228, 196],
  D: [226, 200, 40],
  F: [40, 150, 72],
  B: [36, 70, 140],
  R: [184, 38, 40],
  L: [232, 104, 36],
};

const BACKGROUND: Rgb = [120, 112, 100];
const PLASTIC: Rgb = [22, 22, 24];

export interface FaceDrawing {
  /** Face letters in reading order. */
  readonly letters: string;
  readonly size: number;
  /** Where the face's square is in the picture. */
  readonly x: number;
  readonly y: number;
  readonly side: number;
}

/**
 * An RGBA picture with one face drawn: black plastic, and a sticker inset into each cell. `noise`
 * returns a per-channel offset for each pixel, so pictures can differ like video frames do.
 */
export function drawFace(
  width: number,
  height: number,
  face: FaceDrawing | null,
  noise: () => number = () => 0,
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  const cell = face === null ? 1 : face.side / face.size;
  const inset = cell * 0.08;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let colour = BACKGROUND;
      if (face !== null) {
        const fx = x - face.x;
        const fy = y - face.y;
        if (fx >= 0 && fy >= 0 && fx < face.side && fy < face.side) {
          colour = PLASTIC;
          const column = Math.floor(fx / cell);
          const row = Math.floor(fy / cell);
          const inX = fx - column * cell;
          const inY = fy - row * cell;
          if (inX > inset && inX < cell - inset && inY > inset && inY < cell - inset) {
            colour = SEEN[face.letters.charAt(row * face.size + column) as Face];
          }
        }
      }
      const at = (y * width + x) * 4;
      data[at] = colour[0] + noise();
      data[at + 1] = colour[1] + noise();
      data[at + 2] = colour[2] + noise();
      data[at + 3] = 255;
    }
  }
  return { data, width, height };
}
