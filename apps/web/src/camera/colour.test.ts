import {
  applyAlgorithm,
  applyAlgorithm4,
  cube4ToFacelets,
  SOLVED,
  SOLVED_4,
  toFacelets,
  Xoshiro128StarStar,
  type Face,
} from '@cube/core';
import { describe, expect, it } from 'vitest';
import { FACE_COLOURS } from '../scheme.ts';
import { ciede2000, classifyStickers, paletteLab, srgbToLab, type Lab } from './colour.ts';
import { sampleGrid } from './sample.ts';

// Table I of G. Sharma, W. Wu, E. N. Dalal, "The CIEDE2000 Color-Difference Formula:
// Implementation Notes, Supplementary Test Data, and Mathematical Observations", Color Research
// and Application 30(1), 2005: both colours of each pair and their difference.
const SHARMA: readonly (readonly [Lab, Lab, number])[] = [
  [[50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485], 2.0425],
  [[50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485], 2.8615],
  [[50.0, 2.8361, -74.02], [50.0, 0.0, -82.7485], 3.4412],
  [[50.0, -1.3802, -84.2814], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, -1.1848, -84.8006], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, -0.9009, -85.5211], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, 0.0, 0.0], [50.0, -1.0, 2.0], 2.3669],
  [[50.0, -1.0, 2.0], [50.0, 0.0, 0.0], 2.3669],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0009], 7.1792],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.001], 7.1792],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0011], 7.2195],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0012], 7.2195],
  [[50.0, -0.001, 2.49], [50.0, 0.0009, -2.49], 4.8045],
  [[50.0, -0.001, 2.49], [50.0, 0.001, -2.49], 4.8045],
  [[50.0, -0.001, 2.49], [50.0, 0.0011, -2.49], 4.7461],
  [[50.0, 2.5, 0.0], [50.0, 0.0, -2.5], 4.3065],
  [[50.0, 2.5, 0.0], [73.0, 25.0, -18.0], 27.1492],
  [[50.0, 2.5, 0.0], [61.0, -5.0, 29.0], 22.8977],
  [[50.0, 2.5, 0.0], [56.0, -27.0, -3.0], 31.903],
  [[50.0, 2.5, 0.0], [58.0, 24.0, 15.0], 19.4535],
  [[50.0, 2.5, 0.0], [50.0, 3.1736, 0.5854], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 3.2972, 0.0], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 1.8634, 0.5757], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 3.2592, 0.335], 1.0],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

describe('colour difference', () => {
  it('matches every test pair of Sharma, Wu and Dalal', () => {
    for (const [a, b, expected] of SHARMA) expect(ciede2000(a, b)).toBeCloseTo(expected, 4);
  });

  it('puts sRGB white and black at the ends of the lightness axis', () => {
    const [l, a, b] = srgbToLab(255, 255, 255);
    expect(l).toBeCloseTo(100, 3);
    expect(a).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
    expect(srgbToLab(0, 0, 0)).toEqual([0, 0, 0]);
  });
});

/**
 * Sticker colours as a camera might see them under warm indoor light: made-up values, not
 * measurements, with the blue channel weakened and every sticker a little off.
 */
const SEEN: Readonly<Record<Face, readonly [number, number, number]>> = {
  U: [236, 228, 196],
  D: [226, 200, 40],
  F: [40, 150, 72],
  B: [36, 70, 140],
  R: [184, 38, 40],
  L: [232, 104, 36],
};

function photograph(facelets: string, seed: number): Lab[] {
  const rng = Xoshiro128StarStar.fromSeed(seed);
  const noise = () => (rng.nextU32() / 2 ** 32 - 0.5) * 24;
  return facelets.split('').map((face) => {
    const [r, g, b] = SEEN[face as Face];
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v + noise())));
    return srgbToLab(clamp(r), clamp(g), clamp(b));
  });
}

const PALETTE = paletteLab(FACE_COLOURS);

describe('sticker classification', () => {
  it('reads a 3×3×3 by its centres despite the colour cast', () => {
    const scrambled = applyAlgorithm(SOLVED, "R U R' U' F2 D L2 B' R2 U F'");
    if (!scrambled.ok) throw new Error('bad scramble');
    const facelets = toFacelets(scrambled.value);
    for (let seed = 1; seed <= 20; seed++) {
      expect(classifyStickers(photograph(facelets, seed), 3, PALETTE)).toBe(facelets);
    }
  });

  it('always gives each colour a face of stickers and keeps the 3×3×3 centres', () => {
    const rng = Xoshiro128StarStar.fromSeed(7);
    const byte = () => rng.nextU32() % 256;
    for (const size of [3, 4] as const) {
      const noise = Array.from({ length: 6 * size * size }, () =>
        srgbToLab(byte(), byte(), byte()),
      );
      const letters = classifyStickers(noise, size, PALETTE);
      for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
        expect(letters.split(face).length - 1).toBe(size * size);
      }
      if (size === 3)
        expect([4, 13, 22, 31, 40, 49].map((i) => letters[i]).join('')).toBe('URFDLB');
    }
  });

  it('reads a 4×4×4, which has no fixed centres, by the palette', () => {
    const scrambled = applyAlgorithm4(SOLVED_4, "Rw U2 Fw' L 2R D' Uw2 B Rw' F2 3Uw r2 D Lw'");
    if (!scrambled.ok) throw new Error('bad scramble');
    const facelets = cube4ToFacelets(scrambled.value);
    for (let seed = 1; seed <= 20; seed++) {
      expect(classifyStickers(photograph(facelets, seed), 4, PALETTE)).toBe(facelets);
    }
  });
});

describe('grid sampling', () => {
  it('reads the middle of each cell and ignores glare and the gaps between stickers', () => {
    const size = 3;
    const side = 90;
    const data = new Uint8ClampedArray(side * side * 4);
    const colours: readonly (readonly [number, number, number])[] = [
      [200, 0, 0],
      [0, 200, 0],
      [0, 0, 200],
      [200, 200, 0],
      [0, 200, 200],
      [200, 0, 200],
      [255, 255, 255],
      [100, 100, 100],
      [250, 120, 0],
    ];
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const cell = Math.floor(y / 30) * 3 + Math.floor(x / 30);
        const border = x % 30 < 3 || y % 30 < 3;
        const [r, g, b] = border ? [0, 0, 0] : (colours[cell] ?? [0, 0, 0]);
        data.set([r, g, b, 255], (y * side + x) * 4);
      }
    }
    // A glare spot in the middle of the first sticker.
    data.set([255, 255, 255, 255], (15 * side + 15) * 4);
    const cells = sampleGrid({ data, width: side, height: side }, size);
    expect(cells.map((c) => c.css)).toEqual(
      colours.map(([r, g, b]) => `rgb(${String(r)} ${String(g)} ${String(b)})`),
    );
  });
});
