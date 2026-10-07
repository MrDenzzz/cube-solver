import {
  CORNER_FACELETS,
  CORNERS,
  EDGE_FACELETS,
  EDGES,
  FACES,
  isFace,
  parseFacelets,
  type CubeError,
  type CubieCube,
  type Face,
} from '@cube/core';
import { UNKNOWN } from '../scheme.ts';

/** Sticker input for the 3×3×3: 54 symbols in facelet order, a face letter or UNKNOWN each. */
export const STICKER_COUNT = 54;
const PER_FACE = 9;
const CENTRE = 4;

export const isCentre = (facelet: number) => facelet % PER_FACE === CENTRE;
export const faceOf = (facelet: number): Face => FACES[Math.floor(facelet / PER_FACE)] ?? 'U';

/** Centres fix the colour scheme on a 3×3×3, so they start filled in and cannot be changed. */
export const BLANK_STICKERS = FACES.map(
  (face) => UNKNOWN.repeat(CENTRE) + face + UNKNOWN.repeat(PER_FACE - CENTRE - 1),
).join('');

export function isStickers(value: string): boolean {
  return (
    value.length === STICKER_COUNT &&
    value
      .split('')
      .every((symbol, i) =>
        isCentre(i) ? symbol === faceOf(i) : symbol === UNKNOWN || isFace(symbol),
      )
  );
}

export function paint(stickers: string, facelet: number, colour: Face | typeof UNKNOWN): string {
  if (isCentre(facelet)) return stickers;
  return stickers.slice(0, facelet) + colour + stickers.slice(facelet + 1);
}

export function colourCounts(stickers: string): Record<Face, number> {
  const counts: Record<Face, number> = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
  for (const symbol of stickers) if (isFace(symbol)) counts[symbol]++;
  return counts;
}

export type StickerCheck =
  | { readonly kind: 'incomplete'; readonly missing: number }
  | { readonly kind: 'invalid'; readonly errors: readonly CubeError[] }
  | { readonly kind: 'valid'; readonly cube: CubieCube };

/** Validation waits until every sticker is filled in: half-entered cubes are not errors. */
export function checkStickers(stickers: string): StickerCheck {
  const missing = stickers.split(UNKNOWN).length - 1;
  if (missing > 0) return { kind: 'incomplete', missing };
  const parsed = parseFacelets(stickers);
  return parsed.ok
    ? { kind: 'valid', cube: parsed.value }
    : { kind: 'invalid', errors: parsed.errors };
}

/** Stickers an error points at, for highlighting. */
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
 * The order faces are entered in. Starting from white on top and green in front, the four side
 * faces only need quarter turns of the whole cube, and the top and bottom one tilt each.
 */
export const ENTRY_ORDER: readonly Face[] = ['F', 'R', 'B', 'L', 'U', 'D'];

/** The sticker after `facelet` when typing colours: reading order, then the next face. */
export function nextSticker(facelet: number): number {
  const face = faceOf(facelet);
  for (let i = (facelet % PER_FACE) + 1; i < PER_FACE; i++) {
    if (i !== CENTRE) return FACES.indexOf(face) * PER_FACE + i;
  }
  const next = ENTRY_ORDER[(ENTRY_ORDER.indexOf(face) + 1) % ENTRY_ORDER.length] ?? 'F';
  return FACES.indexOf(next) * PER_FACE;
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

export const NET_COLUMNS = 12;
export const NET_ROWS = 9;

/** Row and column of a sticker in the 12 × 9 grid of the net. */
export function netCell(facelet: number): readonly [number, number] {
  const [faceRow, faceColumn] = NET[faceOf(facelet)];
  const index = facelet % PER_FACE;
  return [faceRow * 3 + Math.floor(index / 3), faceColumn * 3 + (index % 3)];
}

const byCell = new Map(
  Array.from({ length: STICKER_COUNT }, (_, facelet) => [netCell(facelet).join(','), facelet]),
);

/** The nearest sticker of the net in a direction, skipping the gaps; the same one at an edge. */
export function stickerToward(facelet: number, rowStep: number, columnStep: number): number {
  let [row, column] = netCell(facelet);
  for (;;) {
    row += rowStep;
    column += columnStep;
    if (row < 0 || row >= NET_ROWS || column < 0 || column >= NET_COLUMNS) return facelet;
    const found = byCell.get(`${String(row)},${String(column)}`);
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
