import { srgbToLab, type Lab, type Rgb } from './colour.ts';

/** RGBA pixels, as in ImageData. */
export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface CellColour {
  /** The sampled colour as the camera gave it. */
  readonly rgb: Rgb;
  readonly lab: Lab;
  /** The sampled colour as CSS. */
  readonly css: string;
  /** Largest spread of a channel across the sample (10th to 90th percentile): small on one sticker. */
  readonly spread: number;
}

const quantile = (sorted: readonly number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

/** Two groups of a sticker's pixels this far apart in brightness (8-bit) are two colours. */
const TWO_COLOURS = 30;

/**
 * The pixels of the larger of a light and a dark group, split where they separate best (Otsu's
 * threshold on brightness), if they differ enough to be two colours; otherwise all of them.
 */
function dominant(pixels: readonly Rgb[]): readonly Rgb[] {
  const lum = (p: Rgb) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  const sorted = [...pixels].sort((a, b) => lum(a) - lum(b));
  const total = sorted.reduce((sum, p) => sum + lum(p), 0);
  let best = { k: 0, score: 0, gap: 0 };
  let below = 0;
  for (let k = 1; k < sorted.length; k++) {
    below += lum(sorted[k - 1] ?? [0, 0, 0]);
    const dark = below / k;
    const light = (total - below) / (sorted.length - k);
    const score = k * (sorted.length - k) * (light - dark) ** 2;
    if (score > best.score) best = { k, score, gap: light - dark };
  }
  if (best.gap <= TWO_COLOURS) return sorted;
  return best.k * 2 >= sorted.length ? sorted.slice(0, best.k) : sorted.slice(best.k);
}

/**
 * The colour of a square around (cx, cy), and how much it varies. The colour is the median per
 * channel of the square's dominant colour: a logo covering a good part of a centre, or a glare
 * spot, leaves it unchanged, where a plain median would be pulled towards it.
 */
export function sampleAt(pixels: Pixels, cx: number, cy: number, half: number): CellColour {
  const { data, width, height } = pixels;
  const step = Math.max(1, Math.floor(half / 4));
  const read: Rgb[] = [];
  for (let y = Math.round(cy - half); y <= cy + half; y += step) {
    for (let x = Math.round(cx - half); x <= cx + half; x += step) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const at = (y * width + x) * 4;
      read.push([data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0]);
    }
  }
  const channels = (from: readonly Rgb[]) =>
    [0, 1, 2].map((c) => from.map((p) => p[c] ?? 0).sort((a, b) => a - b));
  const [r, g, b] = channels(dominant(read)).map((values) => quantile(values, 0.5)) as [
    number,
    number,
    number,
  ];
  return {
    rgb: [r, g, b],
    lab: srgbToLab(r, g, b),
    css: `rgb(${String(r)} ${String(g)} ${String(b)})`,
    spread: Math.max(...channels(read).map((v) => quantile(v, 0.9) - quantile(v, 0.1))),
  };
}
