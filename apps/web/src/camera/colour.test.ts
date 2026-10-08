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
import { CAMERA_COLOURS, FACE_COLOURS } from '../scheme.ts';
import {
  ciede2000,
  classifyFaces,
  correction,
  nearestFace,
  paletteLab,
  paletteRgb,
  srgbToLab,
  type Lab,
  type Rgb,
} from './colour.ts';
import { SEEN } from './synthetic.ts';

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

/** Linear light at 35 % in red, 28 % in green and 18 % in blue: a dim room lit by a warm lamp. */
function dim(colours: readonly Rgb[]): Rgb[] {
  const gains = [0.35, 0.28, 0.18];
  const encode = (v: number) =>
    Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return colours.map(
    (rgb) =>
      rgb.map((c, k) => {
        const v = c / 255;
        const lin = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        return encode(lin * (gains[k] ?? 1));
      }) as unknown as Rgb,
  );
}

describe('camera correction', () => {
  // Faces as cameras gave them. Two of a stickerless 3×3×3 from a Logitech C270, exposed for a
  // bright window behind the cube: white came out mid-grey and yellow olive.
  const REAL: readonly (readonly [string, readonly Rgb[]])[] = [
    [
      'LDRBBURDF',
      [
        [144, 64, 3],
        [118, 114, 0],
        [101, 23, 4],
        [0, 30, 82],
        [0, 30, 84],
        [113, 116, 113],
        [83, 12, 0],
        [101, 104, 0],
        [3, 67, 9],
      ],
    ],
    [
      'DUFRLRRFF',
      [
        [115, 107, 0],
        [116, 113, 110],
        [19, 72, 15],
        [98, 12, 0],
        [143, 56, 0],
        [89, 20, 1],
        [83, 8, 0],
        [1, 63, 4],
        [4, 62, 5],
      ],
    ],
    // A stickerless 4×4×4 and 3×3×3 under a lamp, from a phone: a light blue among them.
    [
      'UFRDFLRLUURDFLBL',
      [
        [196, 191, 160],
        [81, 170, 10],
        [214, 43, 33],
        [209, 201, 4],
        [81, 151, 25],
        [233, 110, 1],
        [196, 37, 34],
        [211, 104, 0],
        [198, 183, 162],
        [203, 191, 170],
        [201, 45, 40],
        [191, 184, 5],
        [85, 158, 22],
        [225, 111, 0],
        [1, 152, 177],
        [216, 104, 0],
      ],
    ],
    [
      'FDRUBBRDL',
      [
        [39, 157, 57],
        [218, 204, 6],
        [204, 42, 31],
        [210, 192, 158],
        [30, 115, 173],
        [1, 102, 157],
        [207, 75, 47],
        [219, 206, 4],
        [231, 103, 1],
      ],
    ],
  ];
  const palette = paletteRgb(CAMERA_COLOURS);
  const seenPalette = paletteLab(CAMERA_COLOURS);
  const name = (samples: readonly Rgb[], correct: (rgb: Rgb) => Lab) =>
    samples.map((s) => nearestFace(correct(s), seenPalette)).join('');

  it('names real pictures right, one face alone or several together', () => {
    for (const [letters, samples] of REAL) {
      expect(name(samples, correction(samples, palette))).toBe(letters);
    }
    // Pictures from one camera, as a scan takes them.
    for (const set of [REAL.slice(0, 2), REAL.slice(2)]) {
      const correct = correction(
        set.flatMap(([, samples]) => samples),
        palette,
      );
      for (const [letters, samples] of set) expect(name(samples, correct)).toBe(letters);
    }
  });

  it('takes out a warm cast and low exposure', () => {
    const scrambled = applyAlgorithm(SOLVED, "R U R' U' F2 D L2 B' R2 U F'");
    if (!scrambled.ok) throw new Error('bad scramble');
    const facelets = toFacelets(scrambled.value);
    const seen = dim(facelets.split('').map((f) => SEEN[f as Face]));
    expect(name(seen, correction(seen, palette))).toBe(facelets);
  });

  it('leaves colours alone when there is nothing to fit', () => {
    expect(correction([], palette)([200, 30, 40])).toEqual(srgbToLab(200, 30, 40));
  });
});

/** The cube's faces as pictures taken in the order D, B, L, U, F, R. */
const TAKEN = [3, 5, 4, 0, 2, 1];

function faces<T>(stickers: readonly T[], size: number): T[][] {
  const perFace = size * size;
  return TAKEN.map((f) => stickers.slice(f * perFace, (f + 1) * perFace));
}

describe('sticker classification', () => {
  it('reads a 3×3×3 by its centres despite the colour cast', () => {
    const scrambled = applyAlgorithm(SOLVED, "R U R' U' F2 D L2 B' R2 U F'");
    if (!scrambled.ok) throw new Error('bad scramble');
    const facelets = toFacelets(scrambled.value);
    for (let seed = 1; seed <= 20; seed++) {
      const read = classifyFaces(faces(photograph(facelets, seed), 3), 3, PALETTE);
      expect(read).toEqual(faces(facelets.split(''), 3).map((f) => f.join('')));
    }
  });

  it('always gives each colour a face of stickers and the 3×3×3 pictures different centres', () => {
    const rng = Xoshiro128StarStar.fromSeed(7);
    const byte = () => rng.nextU32() % 256;
    for (const size of [3, 4] as const) {
      const noise = Array.from({ length: 6 }, () =>
        Array.from({ length: size * size }, () => srgbToLab(byte(), byte(), byte())),
      );
      const letters = classifyFaces(noise, size, PALETTE).join('');
      for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
        expect(letters.split(face).length - 1).toBe(size * size);
      }
      if (size === 3) {
        const centres = classifyFaces(noise, size, PALETTE).map((f) => f.charAt(4));
        expect(new Set(centres).size).toBe(6);
      }
    }
  });

  it('reads a 4×4×4 under a dim, warm light once the camera is corrected', () => {
    const scrambled = applyAlgorithm4(SOLVED_4, "Rw U2 Fw' L 2R D' Uw2 B Rw' F2 3Uw r2 D Lw'");
    if (!scrambled.ok) throw new Error('bad scramble');
    const facelets = cube4ToFacelets(scrambled.value);
    const seen = dim(facelets.split('').map((f) => SEEN[f as Face]));
    const correct = correction(seen, paletteRgb(FACE_COLOURS));
    const read = classifyFaces(faces(seen.map(correct), 4), 4, PALETTE);
    expect(read).toEqual(faces(facelets.split(''), 4).map((f) => f.join('')));
  });

  it('reads a 4×4×4, which has no fixed centres, by the palette', () => {
    const scrambled = applyAlgorithm4(SOLVED_4, "Rw U2 Fw' L 2R D' Uw2 B Rw' F2 3Uw r2 D Lw'");
    if (!scrambled.ok) throw new Error('bad scramble');
    const facelets = cube4ToFacelets(scrambled.value);
    for (let seed = 1; seed <= 20; seed++) {
      const read = classifyFaces(faces(photograph(facelets, seed), 4), 4, PALETTE);
      expect(read).toEqual(faces(facelets.split(''), 4).map((f) => f.join('')));
    }
  });
});
