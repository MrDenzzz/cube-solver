import { isFace, type Face } from './geometry.ts';
import type { Turns } from './moves.ts';
import { err, ok, type Result } from './util.ts';

/**
 * `wca` accepts exactly WCA Regulations 12a (face moves, nXw outer block moves, x/y/z rotations).
 * `extended` also accepts SiGN, which is common in algorithm sheets: lowercase wide moves (r),
 * inner slices (2R), middle slices (M, E, S) and "X2'".
 */
export type NotationMode = 'wca' | 'extended';

/** A move as written, independent of cube size. Layers are counted from `face`, starting at 1. */
export type Move =
  /** The outer `depth` layers of `face`; depth 1 is a face move. */
  | { readonly kind: 'block'; readonly face: Face; readonly depth: number; readonly turns: Turns }
  /** A single inner layer. */
  | { readonly kind: 'slice'; readonly face: Face; readonly layer: number; readonly turns: Turns }
  /** The central layer of an odd cube, turning like `face`: M like L, E like D, S like F. */
  | { readonly kind: 'middle'; readonly face: Face; readonly turns: Turns }
  /** The whole cube, turning like `face`: x like R, y like U, z like F. */
  | { readonly kind: 'rotation'; readonly face: Face; readonly turns: Turns };

export interface ParsedMove {
  readonly move: Move;
  /** Offsets of the token in the source text, for error highlighting. */
  readonly start: number;
  readonly end: number;
}

interface TokenSpan {
  readonly start: number;
  readonly end: number;
  readonly token: string;
}

export type NotationError =
  | { readonly code: 'unexpected-character'; readonly start: number; readonly character: string }
  /** Malformed regardless of cube size: 1Rw, 2x, 3M, 0R. */
  | ({ readonly code: 'invalid-move' } & TokenSpan)
  /** Valid SiGN, but not part of WCA notation. */
  | ({ readonly code: 'not-wca' } & TokenSpan)
  /** Needs layers this cube does not have: 3Rw on a 3×3×3, M on a 4×4×4. */
  | ({ readonly code: 'layer-out-of-range'; readonly size: number } & TokenSpan);

const MIDDLE: Readonly<Record<string, Face>> = { M: 'L', E: 'D', S: 'F' };
const ROTATION: Readonly<Record<string, Face>> = { x: 'R', y: 'U', z: 'F' };
const PRIMES = "'’‘`´′";

// prefix digits, the move letter(s), an optional "2", an optional prime (several Unicode
// variants survive copy-paste from documents and chat).
const TOKEN = new RegExp(`(\\d+)?([URFDLB]w|[URFDLBurfdlbMESxyz])(2)?([${PRIMES}])?`, 'y');
const SEPARATOR = /[\s,]/;

export function parseAlgorithm(
  text: string,
  mode: NotationMode = 'extended',
): Result<ParsedMove[], NotationError> {
  const moves: ParsedMove[] = [];
  const errors: NotationError[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (SEPARATOR.test(character)) {
      index++;
      continue;
    }
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(text);
    if (match === null) {
      errors.push({ code: 'unexpected-character', start: index, character });
      index++;
      continue;
    }
    const [token, prefix, letters = '', half, prime] = match;
    const start = index;
    const end = index + token.length;
    index = end;

    const turns: Turns = half === undefined ? (prime === undefined ? 1 : 3) : 2;
    const layerCount = prefix === undefined ? undefined : Number(prefix);
    const move = readMove(letters, layerCount, turns);
    if (move.kind === 'invalid') {
      errors.push({ code: 'invalid-move', start, end, token });
      continue;
    }
    // WCA allows a layer count only on outer block moves (nRw), and no "2'" suffix.
    const isWca =
      move.kind !== 'slice' &&
      move.kind !== 'middle' &&
      !/^[urfdlb]$/.test(letters) &&
      (prefix === undefined || letters.endsWith('w')) &&
      !(half !== undefined && prime !== undefined);
    if (mode === 'wca' && !isWca) {
      errors.push({ code: 'not-wca', start, end, token });
      continue;
    }
    moves.push({ move, start, end });
  }
  return errors.length > 0 ? err(errors) : ok(moves);
}

function readMove(
  letters: string,
  layerCount: number | undefined,
  turns: Turns,
): Move | { readonly kind: 'invalid' } {
  const invalid = { kind: 'invalid' } as const;
  const letter = letters.charAt(0);
  const rotation = ROTATION[letter];
  if (rotation !== undefined) {
    return layerCount === undefined ? { kind: 'rotation', face: rotation, turns } : invalid;
  }
  const middle = MIDDLE[letter];
  if (middle !== undefined) {
    return layerCount === undefined ? { kind: 'middle', face: middle, turns } : invalid;
  }
  const face = letter.toUpperCase();
  if (!isFace(face)) return invalid;
  const wide = letters.endsWith('w') || letter !== face;
  if (wide) {
    const depth = layerCount ?? 2;
    return depth >= 2 ? { kind: 'block', face, depth, turns } : invalid;
  }
  if (layerCount === undefined || layerCount === 1) return { kind: 'block', face, depth: 1, turns };
  return layerCount >= 2 ? { kind: 'slice', face, layer: layerCount, turns } : invalid;
}

const SUFFIX: Readonly<Record<Turns, string>> = { 1: '', 2: '2', 3: "'" };

/** WCA notation where it exists (face, outer block, rotation), SiGN for slices. */
export function formatMove(move: Move): string {
  const suffix = SUFFIX[move.turns];
  switch (move.kind) {
    case 'block':
      if (move.depth === 1) return move.face + suffix;
      return `${move.depth === 2 ? '' : String(move.depth)}${move.face}w${suffix}`;
    case 'slice':
      return `${String(move.layer)}${move.face}${suffix}`;
    case 'middle':
      return `${letterFor(MIDDLE, move.face)}${suffix}`;
    case 'rotation':
      return `${letterFor(ROTATION, move.face)}${suffix}`;
  }
}

function letterFor(table: Readonly<Record<string, Face>>, face: Face): string {
  const entry = Object.entries(table).find(([, f]) => f === face);
  if (entry === undefined) throw new RangeError(`No letter for ${face}`);
  return entry[0];
}

export function formatAlgorithm(moves: readonly (Move | ParsedMove)[]): string {
  return moves.map((m) => formatMove('move' in m ? m.move : m)).join(' ');
}
