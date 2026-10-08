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

/**
 * The median colour of a square around (cx, cy), and how much it varies. The median per channel
 * ignores a glare spot or a stray dark pixel that a mean would mix in.
 */
export function sampleAt(pixels: Pixels, cx: number, cy: number, half: number): CellColour {
  const { data, width, height } = pixels;
  const step = Math.max(1, Math.floor(half / 4));
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let y = Math.round(cy - half); y <= cy + half; y += step) {
    for (let x = Math.round(cx - half); x <= cx + half; x += step) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const at = (y * width + x) * 4;
      channels.forEach((values, c) => values.push(data[at + c] ?? 0));
    }
  }
  for (const values of channels) values.sort((a, b) => a - b);
  const [r, g, b] = channels.map((values) => quantile(values, 0.5)) as [number, number, number];
  return {
    rgb: [r, g, b],
    lab: srgbToLab(r, g, b),
    css: `rgb(${String(r)} ${String(g)} ${String(b)})`,
    spread: Math.max(...channels.map((v) => quantile(v, 0.9) - quantile(v, 0.1))),
  };
}
