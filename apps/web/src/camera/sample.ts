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

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

export interface CellColour {
  readonly lab: Lab;
  /** The sampled colour as CSS, for showing what was read. */
  readonly css: string;
}

/**
 * The colour of each cell of a size × size grid over `pixels`, row by row. Each cell's middle is
 * reduced to its per-channel median, which ignores a glare spot or a stray dark pixel that a mean
 * would mix in.
 */
export function sampleGrid(pixels: Pixels, size: number): CellColour[] {
  const cell = Math.min(pixels.width, pixels.height) / size;
  const half = Math.max(1, Math.floor((cell * PATCH) / 2));
  const step = Math.max(1, Math.floor(half / 4));
  const cells: CellColour[] = [];
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const cx = Math.floor((column + 0.5) * cell);
      const cy = Math.floor((row + 0.5) * cell);
      const channels: [number[], number[], number[]] = [[], [], []];
      for (let y = cy - half; y <= cy + half; y += step) {
        for (let x = cx - half; x <= cx + half; x += step) {
          if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) continue;
          const at = (y * pixels.width + x) * 4;
          channels.forEach((values, c) => values.push(pixels.data[at + c] ?? 0));
        }
      }
      const [r, g, b] = channels.map(median) as [number, number, number];
      cells.push({ lab: srgbToLab(r, g, b), css: `rgb(${String(r)} ${String(g)} ${String(b)})` });
    }
  }
  return cells;
}
