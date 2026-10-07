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
  /** Where the face's square is in the picture, before turning. */
  readonly x: number;
  readonly y: number;
  readonly side: number;
  /** Turn about the face's centre, in radians, clockwise on screen. */
  readonly angle?: number;
  /**
   * A stickerless cube: coloured pieces with thin seams in a darker shade of the piece, no black
   * plastic between them.
   */
  readonly stickerless?: boolean;
}

/** A plain rectangle in the background: something else in the room. */
export interface Clutter {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly colour: Rgb;
}

/**
 * An RGBA picture with one face drawn: black plastic, and a sticker inset into each cell, over a
 * background with optional clutter. `noise` returns a per-channel offset for each pixel, so
 * pictures can differ like video frames do.
 */
export function drawFace(
  width: number,
  height: number,
  face: FaceDrawing | null,
  noise: () => number = () => 0,
  clutter: readonly Clutter[] = [],
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  const cell = face === null ? 1 : face.side / face.size;
  const inset = cell * (face?.stickerless === true ? 0.03 : 0.08);
  const cos = Math.cos(-(face?.angle ?? 0));
  const sin = Math.sin(-(face?.angle ?? 0));
  const cx = face === null ? 0 : face.x + face.side / 2;
  const cy = face === null ? 0 : face.y + face.side / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let colour = BACKGROUND;
      for (const thing of clutter) {
        if (
          x >= thing.x &&
          x < thing.x + thing.width &&
          y >= thing.y &&
          y < thing.y + thing.height
        ) {
          colour = thing.colour;
        }
      }
      if (face !== null) {
        // The pixel in the face's own frame: turned back about its centre.
        const fx = cos * (x - cx) - sin * (y - cy) + face.side / 2;
        const fy = sin * (x - cx) + cos * (y - cy) + face.side / 2;
        if (fx >= 0 && fy >= 0 && fx < face.side && fy < face.side) {
          const column = Math.floor(fx / cell);
          const row = Math.floor(fy / cell);
          const inX = fx - column * cell;
          const inY = fy - row * cell;
          const piece = SEEN[face.letters.charAt(row * face.size + column) as Face];
          const seam: Rgb = [piece[0] * 0.8, piece[1] * 0.8, piece[2] * 0.8];
          colour = face.stickerless === true ? seam : PLASTIC;
          if (inX > inset && inX < cell - inset && inY > inset && inY < cell - inset) {
            colour = piece;
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
