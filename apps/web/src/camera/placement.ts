import {
  CORNER_FACELETS,
  CORNER_FACELETS_4,
  CORNER_FACES,
  EDGE_FACELETS,
  FACES,
  isFace,
  OPPOSITE,
  parseFacelets,
  parseFacelets4,
  WING_FACELETS,
  type Face,
} from '@cube/core';

// Puts six face pictures, taken in any order and any way up, back on the cube. A backtracking
// search places them one at a time and checks every piece as soon as all its stickers are down:
// a corner must exist and not be mirrored, an edge must not show two equal or opposite colours.
// Corners cut the search hard (a random triple of colours is a real corner about one time in
// nine), so of the 5! · 4⁵ arrangements of a 4×4×4 a few hundred are looked at. A misread
// sticker breaks a piece, so the search allows a few broken pieces when nothing fits without.

export interface Placement {
  /** Face letters in facelet order. */
  readonly stickers: string;
  /** Pieces that are no real piece: at least one of their stickers was misread. */
  readonly broken: number;
  /** Whether another arrangement fits as well, so the pictures do not settle it. */
  readonly ambiguous: boolean;
}

/** Places of the face pictures are tried in this order, so corners close early. */
const ORDER: readonly Face[] = ['F', 'U', 'R', 'L', 'D', 'B'];
const MAX_BROKEN = 6;

/** A face's cells, in reading order, after turning it a quarter clockwise `turns` times. */
export function rotateGrid<T>(cells: readonly T[], size: number, turns: number): T[] {
  let out = [...cells];
  for (let t = 0; t < turns % 4; t++) {
    const before = out;
    out = before.map((_, i) => before[(size - 1 - (i % size)) * size + Math.floor(i / size)] as T);
  }
  return out;
}

export const rotateFace = (face: string, size: number, turns: number): string =>
  rotateGrid(face.split(''), size, turns).join('');

function cornerIsReal(colours: readonly Face[]): boolean {
  const twist = colours.findIndex((c) => c === 'U' || c === 'D');
  if (twist === -1) return false;
  const turned = colours.map((_, k) => colours[(k + twist) % 3]);
  return CORNER_FACES.some((corner) => corner.every((face, k) => face === turned[k]));
}

const edgeIsReal = (a: Face, b: Face) => a !== b && OPPOSITE[a] !== b;

/**
 * The arrangement with the fewest broken pieces, or null if every one has more than a few. On the
 * 3×3×3 each picture's centre says where it goes; the 4×4×4 has no fixed centres, so the first
 * picture becomes the front, as taken, and the rest are placed around it.
 */
export function placeFaces(faces: readonly string[], size: 3 | 4): Placement | null {
  const perFace = size * size;
  const corners = size === 3 ? CORNER_FACELETS : CORNER_FACELETS_4;
  const edges = size === 3 ? EDGE_FACELETS : WING_FACELETS;
  const faceOf = (facelet: number) => Math.floor(facelet / perFace);
  const touching = <T extends readonly number[]>(pieces: readonly T[]) =>
    FACES.map((_, p) => pieces.filter((piece) => piece.some((f) => faceOf(f) === p)));
  const cornersOn = touching(corners);
  const edgesOn = touching(edges);

  // Which pictures may go where.
  const allowed = ORDER.map((face, step) =>
    faces.flatMap((picture, i) => {
      if (size === 3) return picture.charAt(4) === face ? [i] : [];
      return step === 0 ? (i === 0 ? [i] : []) : i === 0 ? [] : [i];
    }),
  );
  if (size === 3 && allowed.some((pictures) => pictures.length !== 1)) return null;

  const stickers: (Face | null)[] = new Array<Face | null>(6 * perFace).fill(null);
  const brokenOn = (p: number) => {
    let broken = 0;
    for (const piece of cornersOn[p] ?? []) {
      const colours = piece.map((f) => stickers[f] ?? null);
      if (colours.every((c) => c !== null) && !cornerIsReal(colours)) broken++;
    }
    for (const [a = 0, b = 0] of edgesOn[p] ?? []) {
      const ca = stickers[a] ?? null;
      const cb = stickers[b] ?? null;
      if (ca !== null && cb !== null && !edgeIsReal(ca, cb)) broken++;
    }
    return broken;
  };

  const search = (budget: number) => {
    const found: { readonly stickers: string; readonly broken: number }[] = [];
    const visit = (step: number, used: number, broken: number) => {
      if (step === ORDER.length) {
        found.push({ stickers: stickers.join(''), broken });
        return;
      }
      const p = FACES.indexOf(ORDER[step] ?? 'F');
      // The 4×4×4's first picture fixes the cube's orientation, so it is not turned.
      const turns = size === 4 && step === 0 ? 1 : 4;
      for (const i of allowed[step] ?? []) {
        if ((used >> i) & 1) continue;
        for (let t = 0; t < turns; t++) {
          const turned = rotateFace(faces[i] ?? '', size, t);
          for (let k = 0; k < perFace; k++) {
            const letter = turned.charAt(k);
            stickers[p * perFace + k] = isFace(letter) ? letter : null;
          }
          const total = broken + brokenOn(p);
          if (total <= budget) visit(step + 1, used | (1 << i), total);
        }
      }
      for (let k = 0; k < perFace; k++) stickers[p * perFace + k] = null;
    };
    visit(0, 0, 0);
    return found;
  };

  for (let budget = 0; budget <= MAX_BROKEN; budget++) {
    const found = search(budget);
    if (found.length === 0) continue;
    // Among the fewest broken pieces, a whole valid cube beats one with duplicates or parity.
    const parse = size === 3 ? parseFacelets : parseFacelets4;
    const ranked = found.map((f) => ({ ...f, valid: parse(f.stickers).ok }));
    const least = Math.min(...ranked.map((f) => f.broken));
    const best = ranked.filter((f) => f.broken === least);
    const valid = best.filter((f) => f.valid);
    const pick = valid.length > 0 ? valid : best;
    const first = pick[0];
    if (first === undefined) continue;
    return { stickers: first.stickers, broken: first.broken, ambiguous: pick.length > 1 };
  }
  return null;
}
