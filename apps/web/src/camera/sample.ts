import { srgbToLab, type Lab } from './colour.ts';

/** RGBA pixels, as in ImageData. */
export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** The share of the frame's shorter side the face grid covers, centred. */
export const GRID_FRACTION = 0.7;

/** The centred square, in pixels of a width × height frame, that the face should fill. */
export function gridSquare(width: number, height: number, fraction = GRID_FRACTION) {
  const side = Math.round(Math.min(width, height) * fraction);
  return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), side };
}

/** The middle of each cell is read; the edges hold the black plastic between stickers. */
const PATCH = 0.4;

const quantile = (sorted: readonly number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

export interface CellColour {
  readonly lab: Lab;
  /** The sampled colour as CSS, for showing what was read. */
  readonly css: string;
  /** Largest spread of a channel across the cell's middle (10th to 90th percentile): small on one sticker. */
  readonly spread: number;
}

export interface GridReading {
  /** Row by row. */
  readonly cells: readonly CellColour[];
  /** Share of the borders between neighbouring cells that are dark, as the gaps between pieces are. */
  readonly darkBorders: number;
}

const luminance = (data: Uint8ClampedArray, at: number) =>
  0.299 * (data[at] ?? 0) + 0.587 * (data[at + 1] ?? 0) + 0.114 * (data[at + 2] ?? 0);

/**
 * Reads a size × size grid over `pixels`. Each cell's middle is reduced to its per-channel
 * median, which ignores a glare spot or a stray dark pixel that a mean would mix in. Each border
 * between neighbouring cells is searched across for a line darker than the cells beside it.
 */
export function readGrid(pixels: Pixels, size: number): GridReading {
  const { data, width, height } = pixels;
  const cell = Math.min(width, height) / size;
  const half = Math.max(1, Math.floor((cell * PATCH) / 2));
  const step = Math.max(1, Math.floor(half / 4));
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;

  const cells: CellColour[] = [];
  const brightness: number[] = [];
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const cx = Math.floor((column + 0.5) * cell);
      const cy = Math.floor((row + 0.5) * cell);
      const channels: [number[], number[], number[]] = [[], [], []];
      for (let y = cy - half; y <= cy + half; y += step) {
        for (let x = cx - half; x <= cx + half; x += step) {
          if (!inside(x, y)) continue;
          const at = (y * width + x) * 4;
          channels.forEach((values, c) => values.push(data[at + c] ?? 0));
        }
      }
      for (const values of channels) values.sort((a, b) => a - b);
      const [r, g, b] = channels.map((values) => quantile(values, 0.5)) as [number, number, number];
      const spread = Math.max(...channels.map((v) => quantile(v, 0.9) - quantile(v, 0.1)));
      cells.push({
        lab: srgbToLab(r, g, b),
        css: `rgb(${String(r)} ${String(g)} ${String(b)})`,
        spread,
      });
      brightness.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }

  // The darkest point across each border, near its middle, against the two cells' brightness.
  const reach = Math.max(1, Math.floor(cell * 0.2));
  let borders = 0;
  let dark = 0;
  const border = (x0: number, y0: number, dx: number, dy: number, beside: number) => {
    let darkest = 255;
    for (let along = -1; along <= 1; along++) {
      for (let k = -reach; k <= reach; k++) {
        const x = Math.round(x0 + dx * k + dy * along * reach);
        const y = Math.round(y0 + dy * k + dx * along * reach);
        if (inside(x, y)) darkest = Math.min(darkest, luminance(data, (y * width + x) * 4));
      }
    }
    borders++;
    if (darkest < beside * 0.6 && beside - darkest > 20) dark++;
  };
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const here = brightness[row * size + column] ?? 0;
      if (column + 1 < size) {
        const right = brightness[row * size + column + 1] ?? 0;
        border((column + 1) * cell, (row + 0.5) * cell, 1, 0, Math.min(here, right));
      }
      if (row + 1 < size) {
        const below = brightness[(row + 1) * size + column] ?? 0;
        border((column + 0.5) * cell, (row + 1) * cell, 0, 1, Math.min(here, below));
      }
    }
  }
  return { cells, darkBorders: borders === 0 ? 0 : dark / borders };
}
