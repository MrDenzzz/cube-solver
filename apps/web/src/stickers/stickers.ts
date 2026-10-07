import {
  CORNER_FACELETS,
  CORNERS,
  EDGE_FACELETS,
  EDGES,
  FACES,
  isFace,
  parseFacelets,
  parseFacelets4,
  type Cube4,
  type Cube4Error,
  type CubeError,
  type CubieCube,
  type Face,
} from '@cube/core';
import type { I18n } from '../i18n/i18n.ts';
import { UNKNOWN } from '../scheme.ts';
import { describeCube4Error, describeCubeError } from './describe.ts';

/**
 * Sticker input for an N×N×N cube: 6·N² symbols in facelet order, a face letter or UNKNOWN each.
 * Most functions take the size last, defaulting to the 3×3×3.
 */
export type PuzzleSize = 3 | 4;

export const stickerCount = (size: PuzzleSize) => 6 * size * size;
const perFace = (size: PuzzleSize) => size * size;

/** On the 3×3×3 the centres fix the colour scheme, so they start filled in and cannot change. */
export const isFixed = (facelet: number, size: PuzzleSize = 3) =>
  size === 3 && facelet % perFace(size) === 4;

export const faceOf = (facelet: number, size: PuzzleSize = 3): Face =>
  FACES[Math.floor(facelet / perFace(size))] ?? 'U';

export function blankStickers(size: PuzzleSize): string {
  return Array.from({ length: stickerCount(size) }, (_, facelet) =>
    isFixed(facelet, size) ? faceOf(facelet, size) : UNKNOWN,
  ).join('');
}

export const BLANK_STICKERS = blankStickers(3);

export function isStickers(value: string, size: PuzzleSize = 3): boolean {
  return (
    value.length === stickerCount(size) &&
    value
      .split('')
      .every((symbol, i) =>
        isFixed(i, size) ? symbol === faceOf(i, size) : symbol === UNKNOWN || isFace(symbol),
      )
  );
}

export function paint(
  stickers: string,
  facelet: number,
  colour: Face | typeof UNKNOWN,
  size: PuzzleSize = 3,
): string {
  if (isFixed(facelet, size)) return stickers;
  return stickers.slice(0, facelet) + colour + stickers.slice(facelet + 1);
}

export function colourCounts(stickers: string): Record<Face, number> {
  const counts: Record<Face, number> = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
  for (const symbol of stickers) if (isFace(symbol)) counts[symbol]++;
  return counts;
}

/** Something wrong with the entered stickers: what to say, and which stickers to highlight. */
export interface StickerProblem {
  readonly facelets: readonly number[];
  readonly describe: (t: I18n['t']) => string;
}

export type StickerCheck<C> =
  | { readonly kind: 'incomplete'; readonly missing: number }
  | { readonly kind: 'invalid'; readonly problems: readonly StickerProblem[] }
  | { readonly kind: 'valid'; readonly cube: C };

const missing = (stickers: string) => stickers.split(UNKNOWN).length - 1;

/** Validation waits until every sticker is filled in: half-entered cubes are not errors. */
export function checkStickers(stickers: string): StickerCheck<CubieCube> {
  if (missing(stickers) > 0) return { kind: 'incomplete', missing: missing(stickers) };
  const parsed = parseFacelets(stickers);
  if (parsed.ok) return { kind: 'valid', cube: parsed.value };
  return {
    kind: 'invalid',
    problems: parsed.errors.map((error) => ({
      facelets: errorFacelets(error),
      describe: (t) => describeCubeError(error, t),
    })),
  };
}

export function checkStickers4(stickers: string): StickerCheck<Cube4> {
  if (missing(stickers) > 0) return { kind: 'incomplete', missing: missing(stickers) };
  const parsed = parseFacelets4(stickers);
  if (parsed.ok) return { kind: 'valid', cube: parsed.value };
  return {
    kind: 'invalid',
    problems: parsed.errors.map((error: Cube4Error) => ({
      facelets: 'facelets' in error ? error.facelets : [],
      describe: (t) => describeCube4Error(error, t),
    })),
  };
}

/** Stickers a 3×3×3 error points at, for highlighting. */
export function errorFacelets(error: CubeError): readonly number[] {
  switch (error.code) {
    case 'duplicate-centre-colour':
    case 'unknown-colour':
    case 'invalid-corner':
    case 'mirrored-corner':
    case 'invalid-edge':
      return error.facelets;
    case 'duplicate-corner':
      return error.positions.flatMap((p) => CORNER_FACELETS[CORNERS.indexOf(p)] ?? []);
    case 'duplicate-edge':
      return error.positions.flatMap((p) => EDGE_FACELETS[EDGES.indexOf(p)] ?? []);
    case 'invalid-length':
    case 'colour-count':
    case 'twisted-corner':
    case 'flipped-edge':
    case 'parity':
    case 'malformed-cubies':
      return [];
  }
}

/**
 * The order faces are entered in. From the starting hold, the four side faces only need quarter
 * turns of the whole cube, and the top and bottom one tilt each.
 */
export const ENTRY_ORDER: readonly Face[] = ['F', 'R', 'B', 'L', 'U', 'D'];

/** The sticker after `facelet` when typing colours: reading order, then the next face. */
export function nextSticker(facelet: number, size: PuzzleSize = 3): number {
  const face = faceOf(facelet, size);
  const first = FACES.indexOf(face) * perFace(size);
  for (let i = (facelet % perFace(size)) + 1; i < perFace(size); i++) {
    if (!isFixed(first + i, size)) return first + i;
  }
  const next = ENTRY_ORDER[(ENTRY_ORDER.indexOf(face) + 1) % ENTRY_ORDER.length] ?? 'F';
  return FACES.indexOf(next) * perFace(size);
}

// The unfolded cube: U above F, then L F R B in a row, D below F. Each face is read in facelet
// order, which is exactly how it appears in this net.
const NET: Readonly<Record<Face, readonly [number, number]>> = {
  U: [0, 1],
  L: [1, 0],
  F: [1, 1],
  R: [1, 2],
  B: [1, 3],
  D: [2, 1],
};

export const netColumns = (size: PuzzleSize) => 4 * size;
export const netRows = (size: PuzzleSize) => 3 * size;

/** Row and column of a sticker in the grid of the net. */
export function netCell(facelet: number, size: PuzzleSize = 3): readonly [number, number] {
  const [faceRow, faceColumn] = NET[faceOf(facelet, size)];
  const index = facelet % perFace(size);
  return [faceRow * size + Math.floor(index / size), faceColumn * size + (index % size)];
}

const cellMaps = new Map<PuzzleSize, Map<string, number>>();

function stickerAtCell(row: number, column: number, size: PuzzleSize): number | undefined {
  let cells = cellMaps.get(size);
  if (cells === undefined) {
    cells = new Map(
      Array.from({ length: stickerCount(size) }, (_, f) => [netCell(f, size).join(','), f]),
    );
    cellMaps.set(size, cells);
  }
  return cells.get(`${String(row)},${String(column)}`);
}

/** The nearest sticker of the net in a direction, skipping the gaps; the same one at an edge. */
export function stickerToward(
  facelet: number,
  rowStep: number,
  columnStep: number,
  size: PuzzleSize = 3,
): number {
  let [row, column] = netCell(facelet, size);
  for (;;) {
    row += rowStep;
    column += columnStep;
    if (row < 0 || row >= netRows(size) || column < 0 || column >= netColumns(size)) return facelet;
    const found = stickerAtCell(row, column, size);
    if (found !== undefined) return found;
  }
}

// Colour initials on English and Russian keyboards: white/белый, yellow/жёлтый, green/зелёный,
// blue/синий, red/красный, orange/оранжевый. The two layouts have no letter in common here.
const KEYS: Readonly<Record<string, Face>> = {
  w: 'U',
  y: 'D',
  g: 'F',
  b: 'B',
  r: 'R',
  o: 'L',
  б: 'U',
  ж: 'D',
  з: 'F',
  с: 'B',
  к: 'R',
  о: 'L',
};

export function colourForKey(key: string): Face | undefined {
  return KEYS[key.toLowerCase()];
}
