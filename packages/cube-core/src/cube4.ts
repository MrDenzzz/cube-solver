import { toLayerTurns, type LayerTurn } from './algorithm.ts';
import { CORNER_FACES, EDGE_FACES, multiply, type CubieCube } from './cubie.ts';
import {
  FACES,
  faceletAt,
  faceletOfCubie,
  faceNormal,
  isFace,
  OPPOSITE,
  rotateTurns,
  stickerAt,
  type Face,
  type Vec3,
} from './geometry.ts';
import { inverseTurns, MOVE_CUBES, faceTurnIndex, type Turns } from './moves.ts';
import type { Rng } from './random.ts';
import { nextBelow } from './random.ts';
import { parseAlgorithm, type NotationError, type NotationMode } from './notation.ts';
import { at, err, ok, symbols, type Result } from './util.ts';

// The 4×4×4 at piece level: 8 corners (as on the 3×3×3), 24 wing edges, two per edge position,
// and 24 centres, four per face. Same-coloured centres are interchangeable, so centres are
// stored as the colour in each slot; wings can never flip in place, so a wing's identity follows
// from its colours and the order they show in its slot. Slots and moves come from the same
// sticker geometry as everything else in this package.

const SIZE = 4;
const PER_FACE = SIZE * SIZE;
export const STICKERS_4 = 6 * PER_FACE;

/** Facelets of each corner slot, in the corner's reference order (U/D sticker first). */
export const CORNER_FACELETS_4: readonly (readonly number[])[] = CORNER_FACES.map((faces) =>
  faces.map((face) => faceletOfCubie(SIZE, face, faces)),
);

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Facelets of each wing slot: slot 2e + k is the k-th wing of edge position e (Kociemba's edge
 * order), [sticker on the edge's reference face, sticker on its other face]; k = 0 is the wing
 * whose reference sticker has the lower facelet index.
 */
export const WING_FACELETS: readonly (readonly [number, number])[] = EDGE_FACES.flatMap((faces) => {
  const [a, b] = faces as readonly [Face, Face];
  const along = cross(faceNormal(a), faceNormal(b));
  const base = add(scale(faceNormal(a), SIZE - 1), scale(faceNormal(b), SIZE - 1));
  const wings = [-1, 1].map((t): [number, number] => {
    const position = add(base, scale(along, t));
    return [
      faceletAt(SIZE, { position, normal: faceNormal(a) }),
      faceletAt(SIZE, { position, normal: faceNormal(b) }),
    ];
  });
  wings.sort((x, y) => x[0] - y[0]);
  return wings;
});

/** Facelet of each centre slot: face by face, in reading order. */
export const CENTRE_FACELETS: readonly number[] = FACES.flatMap((_, f) =>
  [5, 6, 9, 10].map((i) => f * PER_FACE + i),
);

/** The face (and colour) each wing belongs to: [reference face, other face] of its edge. */
const wingColours = (wing: number) => at(EDGE_FACES, wing >> 1);

export interface Cube4 {
  /** Corners as on the 3×3×3: cp[i] sits at slot i, twisted co[i]. */
  readonly cp: readonly number[];
  readonly co: readonly number[];
  /** wp[i] is the wing at slot i; wing w is the one whose home is slot w. */
  readonly wp: readonly number[];
  /** Face index of the colour of the centre piece in each slot. */
  readonly centres: readonly number[];
}

export const SOLVED_4: Cube4 = {
  cp: [0, 1, 2, 3, 4, 5, 6, 7],
  co: [0, 0, 0, 0, 0, 0, 0, 0],
  wp: Array.from({ length: 24 }, (_, i) => i),
  centres: Array.from({ length: 24 }, (_, i) => i >> 2),
};

/** Slot permutations of one layer turn: after it, slot i holds what slot source[i] held. */
interface SlotMove {
  readonly wings: readonly number[];
  readonly centres: readonly number[];
  /** The 3×3×3 face turn the corners make, if the turn includes an outer layer. */
  readonly corners: CubieCube | null;
}

function facePermutation(turn: LayerTurn): number[] {
  // Where each sticker goes, then inverted to "destination ← source".
  const axis = faceNormal(turn.face);
  const source = Array.from({ length: STICKERS_4 }, (_, i) => i);
  for (let f = 0; f < STICKERS_4; f++) {
    const { position, normal } = stickerAt(SIZE, f);
    const depth =
      (SIZE - 1 - (position[0] * axis[0] + position[1] * axis[1] + position[2] * axis[2])) / 2 + 1;
    if (depth < turn.from || depth > turn.to) continue;
    const target = faceletAt(SIZE, {
      position: rotateTurns(axis, position, turn.turns),
      normal: rotateTurns(axis, normal, turn.turns),
    });
    source[target] = f;
  }
  return source;
}

const slotMoves = new Map<string, SlotMove>();

function slotMove(turn: LayerTurn): SlotMove {
  const key = `${turn.face}${String(turn.from)}${String(turn.to)}${String(turn.turns)}`;
  const cached = slotMoves.get(key);
  if (cached !== undefined) return cached;
  const source = facePermutation(turn);
  const wingAt = new Map(WING_FACELETS.map(([f], slot) => [f, slot]));
  const wingAt2 = new Map(WING_FACELETS.map(([, f], slot) => [f, slot]));
  const centreAt = new Map(CENTRE_FACELETS.map((f, slot) => [f, slot]));
  const wings = WING_FACELETS.map(([f]) => {
    const from = at(source, f);
    const slot = wingAt.get(from) ?? wingAt2.get(from);
    if (slot === undefined) throw new Error('A wing sticker moved off the wings');
    return slot;
  });
  const centres = CENTRE_FACELETS.map((f) => {
    const slot = centreAt.get(at(source, f));
    if (slot === undefined) throw new Error('A centre sticker moved off the centres');
    return slot;
  });
  // Corners move with the outer layers: layer 1 turns like the face, layer N like the opposite
  // face the other way.
  let corners: CubieCube | null = null;
  const outer = (face: Face, turns: Turns) => at(MOVE_CUBES, faceTurnIndex({ face, turns }));
  if (turn.from === 1) corners = outer(turn.face, turn.turns);
  if (turn.to === SIZE) {
    const far = outer(OPPOSITE[turn.face], inverseTurns(turn.turns));
    corners = corners === null ? far : multiply(corners, far);
  }
  const move = { wings, centres, corners };
  slotMoves.set(key, move);
  return move;
}

/** The slot permutations of a layer turn, for building move tables. */
export function slotPermutations(turn: LayerTurn): SlotMove {
  return slotMove(turn);
}

export function applyLayerTurn4(cube: Cube4, turn: LayerTurn): Cube4 {
  const move = slotMove(turn);
  const m = move.corners;
  return {
    cp: m === null ? cube.cp : m.cp.map((from) => at(cube.cp, from)),
    co: m === null ? cube.co : m.cp.map((from, i) => (at(cube.co, from) + at(m.co, i)) % 3),
    wp: move.wings.map((from) => at(cube.wp, from)),
    centres: move.centres.map((from) => at(cube.centres, from)),
  };
}

export function applyLayerTurns4(cube: Cube4, turns: readonly LayerTurn[]): Cube4 {
  return turns.reduce(applyLayerTurn4, cube);
}

/** Parses an algorithm and applies it to a 4×4×4 state. */
export function applyAlgorithm4(
  cube: Cube4,
  text: string,
  mode: NotationMode = 'extended',
): Result<Cube4, NotationError> {
  const parsed = parseAlgorithm(text, mode);
  if (!parsed.ok) return parsed;
  const turns = toLayerTurns(parsed.value, SIZE);
  return turns.ok ? ok(applyLayerTurns4(cube, turns.value)) : turns;
}

const TURNS: readonly Turns[] = [1, 2, 3];

/**
 * The turns the 4×4×4 solver makes, numbered for passing between threads: the 18 outer turns in
 * face turn order (U, U2, U′, R, …), then the wide turns Uw, Rw and Fw with their powers. Wide
 * turns of the other three faces are not needed without fixed centres.
 */
export const MOVES_4: readonly LayerTurn[] = [
  ...FACES.flatMap((face) => TURNS.map((turns) => ({ face, from: 1, to: 1, turns }))),
  ...(['U', 'R', 'F'] as const).flatMap((face) =>
    TURNS.map((turns) => ({ face, from: 1, to: 2, turns })),
  ),
];

/**
 * Which way round each wing shows its colours in each slot: 0 if its reference colour is on the
 * slot's reference facelet. Wings cannot flip in place, so this is a property of the pair, found
 * by moving every wing everywhere from the solved cube.
 */
const WING_ORDER: readonly (readonly number[])[] = (() => {
  const order = Array.from({ length: 24 }, () => new Array<number>(24).fill(-1));
  // Where each sticker goes under the outer and inner quarter turns of every face.
  const generators = FACES.flatMap((face) =>
    [1, 2].map((layer) => {
      const source = facePermutation({ face, from: layer, to: layer, turns: 1 });
      const target = new Array<number>(STICKERS_4);
      source.forEach((from, to) => (target[from] = to));
      return target;
    }),
  );
  // Track the facelet each wing's reference sticker sits on, breadth first over states seen.
  let frontier: number[][] = [WING_FACELETS.map(([f]) => f)];
  const seen = new Set<string>([frontier[0]?.join() ?? '']);
  const record = (refs: readonly number[]) => {
    refs.forEach((facelet, wing) => {
      const slot = WING_FACELETS.findIndex(([a, b]) => a === facelet || b === facelet);
      const row = at(order, wing);
      const value = WING_FACELETS[slot]?.[0] === facelet ? 0 : 1;
      if (row[slot] !== -1 && row[slot] !== value) throw new Error('A wing flipped in place');
      row[slot] = value;
    });
  };
  record(frontier[0] ?? []);
  while (frontier.length > 0 && order.some((row) => row.includes(-1))) {
    const next: number[][] = [];
    for (const refs of frontier) {
      for (const target of generators) {
        const moved = refs.map((f) => at(target, f));
        const key = moved.join();
        if (seen.has(key)) continue;
        seen.add(key);
        record(moved);
        next.push(moved);
      }
    }
    frontier = next;
  }
  if (order.some((row) => row.includes(-1))) throw new Error('Some wing never reached a slot');
  return order;
})();

/** Whether a wing in a slot shows its reference colour on the slot's other facelet. */
export function wingFlipped(wing: number, slot: number): boolean {
  return at(at(WING_ORDER, wing), slot) === 1;
}

export function cube4ToFacelets(cube: Cube4): string {
  const faces: Face[] = FACES.flatMap((face) => new Array<Face>(PER_FACE).fill(face));
  cube.cp.forEach((corner, slot) => {
    const twist = at(cube.co, slot);
    const facelets = at(CORNER_FACELETS_4, slot);
    at(CORNER_FACES, corner).forEach((face, k) => {
      faces[at(facelets, (k + twist) % 3)] = face;
    });
  });
  cube.wp.forEach((wing, slot) => {
    const [ref, other] = at(WING_FACELETS, slot);
    const [a, b] = wingColours(wing) as readonly [Face, Face];
    const flipped = at(at(WING_ORDER, wing), slot) === 1;
    faces[ref] = flipped ? b : a;
    faces[other] = flipped ? a : b;
  });
  cube.centres.forEach((colour, slot) => {
    faces[at(CENTRE_FACELETS, slot)] = at(FACES, colour);
  });
  return faces.join('');
}

export type Cube4Error =
  | { readonly code: 'invalid-length'; readonly expected: number; readonly actual: number }
  | {
      readonly code: 'unknown-colour';
      readonly colour: string;
      readonly facelets: readonly number[];
    }
  | {
      readonly code: 'colour-count';
      readonly face: Face;
      readonly count: number;
      readonly expected: number;
    }
  | { readonly code: 'centre-count'; readonly face: Face; readonly count: number }
  | { readonly code: 'invalid-corner'; readonly facelets: readonly number[] }
  | { readonly code: 'mirrored-corner'; readonly facelets: readonly number[] }
  | { readonly code: 'duplicate-corner'; readonly facelets: readonly number[] }
  | { readonly code: 'twisted-corner' }
  | { readonly code: 'invalid-wing'; readonly facelets: readonly number[] }
  | { readonly code: 'duplicate-wing'; readonly facelets: readonly number[] };

const sameSet = (a: readonly Face[], b: readonly Face[]) => a.every((f) => b.includes(f));

/**
 * Reads 96 stickers in facelet order, colours given as face letters (the fixed colour scheme).
 * There are no fixed centres, so any whole-cube orientation is just another state. Checks what
 * a 4×4×4 can show: 16 stickers and four centres per colour, eight distinct untwisted corners,
 * and every wing exactly once. Wing parity and centre arrangement are free.
 */
export function parseFacelets4(input: string): Result<Cube4, Cube4Error> {
  const stickers = symbols(input);
  if (stickers.length !== STICKERS_4) {
    return err([{ code: 'invalid-length', expected: STICKERS_4, actual: stickers.length }]);
  }
  const errors: Cube4Error[] = [];
  const unknown = new Map<string, number[]>();
  stickers.forEach((s, i) => {
    if (!isFace(s)) unknown.set(s, [...(unknown.get(s) ?? []), i]);
  });
  for (const [colour, facelets] of unknown)
    errors.push({ code: 'unknown-colour', colour, facelets });
  if (errors.length > 0) return err(errors);
  const faces = stickers as Face[];
  for (const face of FACES) {
    const count = faces.filter((f) => f === face).length;
    if (count !== PER_FACE) errors.push({ code: 'colour-count', face, count, expected: PER_FACE });
    const centres = CENTRE_FACELETS.filter((f) => faces[f] === face).length;
    if (centres !== 4) errors.push({ code: 'centre-count', face, count: centres });
  }
  if (errors.length > 0) return err(errors);

  const cp: number[] = [];
  const co: number[] = [];
  CORNER_FACELETS_4.forEach((facelets) => {
    const shown = facelets.map((f) => at(faces, f));
    const corner = CORNER_FACES.findIndex((reference) => sameSet(reference, shown));
    const twist = shown.findIndex((face) => face === 'U' || face === 'D');
    const reference = corner === -1 ? undefined : at(CORNER_FACES, corner);
    if (reference === undefined || twist === -1) {
      errors.push({ code: 'invalid-corner', facelets });
      return;
    }
    const rotated = shown.map((_, k) => at(shown, (k + twist) % 3));
    if (!rotated.every((face, k) => face === reference[k])) {
      errors.push({ code: 'mirrored-corner', facelets });
      return;
    }
    cp.push(corner);
    co.push(twist);
  });
  const wp: number[] = [];
  WING_FACELETS.forEach(([ref, other], slot) => {
    const shown: Face[] = [at(faces, ref), at(faces, other)];
    const wing = Array.from({ length: 24 }, (_, w) => w).find((w) => {
      const [a, b] = wingColours(w) as readonly [Face, Face];
      const flipped = at(at(WING_ORDER, w), slot) === 1;
      return flipped ? shown[0] === b && shown[1] === a : shown[0] === a && shown[1] === b;
    });
    if (wing === undefined) errors.push({ code: 'invalid-wing', facelets: [ref, other] });
    else wp.push(wing);
  });
  if (errors.length > 0) return err(errors);
  cp.forEach((corner, slot) => {
    if (cp.indexOf(corner) !== slot) {
      errors.push({ code: 'duplicate-corner', facelets: at(CORNER_FACELETS_4, slot) });
    }
  });
  wp.forEach((wing, slot) => {
    if (wp.indexOf(wing) !== slot)
      errors.push({ code: 'duplicate-wing', facelets: at(WING_FACELETS, slot) });
  });
  if (co.reduce((s, t) => s + t, 0) % 3 !== 0) errors.push({ code: 'twisted-corner' });
  if (errors.length > 0) return err(errors);
  const centres = CENTRE_FACELETS.map((f) => FACES.indexOf(at(faces, f)));
  return ok({ cp, co, wp, centres });
}

function shuffle(values: number[], rng: Rng): number[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = nextBelow(rng, i + 1);
    [values[i], values[j]] = [at(values, j), at(values, i)];
  }
  return values;
}

/**
 * A uniformly random 4×4×4 state. Every corner permutation, wing permutation and centre
 * arrangement occurs, with corner twists summing to 0 mod 3: inner quarter turns change wing
 * parity, and swapping two same-coloured centres makes any centre parity look the same.
 */
export function randomCube4(rng: Rng): Cube4 {
  const cp = shuffle(
    Array.from({ length: 8 }, (_, i) => i),
    rng,
  );
  const co = Array.from({ length: 7 }, () => nextBelow(rng, 3));
  co.push((3 - (co.reduce((s, t) => s + t, 0) % 3)) % 3);
  const wp = shuffle(
    Array.from({ length: 24 }, (_, i) => i),
    rng,
  );
  const centres = shuffle(
    Array.from({ length: 24 }, (_, i) => i >> 2),
    rng,
  );
  return { cp, co, wp, centres };
}

/** Every face one colour, in any orientation: a 4×4×4 has no fixed centres. */
export function isSolved4(cube: Cube4): boolean {
  const facelets = cube4ToFacelets(cube);
  return FACES.every((_, f) => {
    const face = facelets.slice(f * PER_FACE, (f + 1) * PER_FACE);
    return face === face.charAt(0).repeat(PER_FACE);
  });
}
