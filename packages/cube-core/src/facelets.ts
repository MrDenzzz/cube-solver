import {
  CORNER_FACELETS,
  CORNER_FACES,
  CORNERS,
  EDGE_FACELETS,
  EDGE_FACES,
  EDGES,
  type CubieCube,
} from './cubie.ts';
import type { CubeError } from './errors.ts';
import { FACES, solvedFacelets, type Face } from './geometry.ts';
import { at, err, ok, symbols, type Result } from './util.ts';
import { checkInvariants } from './validation.ts';

const STICKERS_PER_FACE = 9;
const FACELET_COUNT = 6 * STICKERS_PER_FACE;
const CENTRE = 4;

/** Kociemba's facelet string of the solved cube: U1..U9, R1..R9, F1..F9, D1..D9, L1..L9, B1..B9. */
export const SOLVED_FACELETS = solvedFacelets(3);

export function toFacelets(cube: CubieCube): string {
  const facelets: Face[] = FACES.flatMap((face) => new Array<Face>(STICKERS_PER_FACE).fill(face));
  cube.cp.forEach((corner, position) => {
    const twist = at(cube.co, position);
    const slots = at(CORNER_FACELETS, position);
    at(CORNER_FACES, corner).forEach((face, k) => {
      facelets[at(slots, (k + twist) % 3)] = face;
    });
  });
  cube.ep.forEach((edge, position) => {
    const flip = at(cube.eo, position);
    const slots = at(EDGE_FACELETS, position);
    at(EDGE_FACES, edge).forEach((face, k) => {
      facelets[at(slots, (k + flip) % 2)] = face;
    });
  });
  return facelets.join('');
}

const sameSet = (a: readonly Face[], b: readonly Face[]) =>
  a.length === b.length && a.every((face) => b.includes(face));

/** Rotations of `faces` that start with each element in turn: the orders a corner can show. */
const rotations = (faces: readonly Face[]) =>
  faces.map((_, start) => faces.map((__, k) => at(faces, (start + k) % faces.length)));

const sameOrder = (a: readonly Face[], b: readonly Face[]) => a.every((face, i) => face === b[i]);

/**
 * Reads 54 stickers in Kociemba's facelet order. Any six distinct symbols work as colours: each
 * centre defines which face its colour belongs to, so "UUUU…" strings, single-letter colour codes
 * and whole colour names are all accepted.
 */
export function parseFacelets(input: string | readonly string[]): Result<CubieCube, CubeError> {
  const colours = typeof input === 'string' ? symbols(input) : input;
  if (colours.length !== FACELET_COUNT) {
    return err([{ code: 'invalid-length', expected: FACELET_COUNT, actual: colours.length }]);
  }

  const faceOf = new Map<string, Face>();
  const centreColours = FACES.map((_, f) => at(colours, f * STICKERS_PER_FACE + CENTRE));
  const errors: CubeError[] = [];
  for (const colour of new Set(centreColours)) {
    const centres = FACES.flatMap((_, f) =>
      centreColours[f] === colour ? [f * STICKERS_PER_FACE + CENTRE] : [],
    );
    if (centres.length > 1) {
      errors.push({ code: 'duplicate-centre-colour', colour, facelets: centres });
    }
  }
  if (errors.length > 0) return err(errors);
  FACES.forEach((face, f) => faceOf.set(at(centreColours, f), face));

  const unknown = new Map<string, number[]>();
  colours.forEach((colour, facelet) => {
    if (!faceOf.has(colour)) unknown.set(colour, [...(unknown.get(colour) ?? []), facelet]);
  });
  for (const [colour, facelets] of unknown)
    errors.push({ code: 'unknown-colour', colour, facelets });
  if (errors.length > 0) return err(errors);

  const faces = colours.map((colour) => faceOf.get(colour) ?? 'U');
  for (const face of FACES) {
    const count = faces.filter((f) => f === face).length;
    if (count !== STICKERS_PER_FACE) {
      errors.push({ code: 'colour-count', face, count, expected: STICKERS_PER_FACE });
    }
  }
  if (errors.length > 0) return err(errors);

  const cp: number[] = [];
  const co: number[] = [];
  CORNER_FACELETS.forEach((slots, position) => {
    const shown = slots.map((slot) => at(faces, slot));
    const corner = CORNER_FACES.findIndex((reference) => sameSet(reference, shown));
    const twist = shown.findIndex((face) => face === 'U' || face === 'D');
    const reference = corner === -1 ? undefined : at(CORNER_FACES, corner);
    if (reference === undefined || twist === -1) {
      errors.push({ code: 'invalid-corner', position: at(CORNERS, position), facelets: slots });
    } else if (!sameOrder(at(rotations(shown), twist), reference)) {
      errors.push({
        code: 'mirrored-corner',
        position: at(CORNERS, position),
        corner: at(CORNERS, corner),
        facelets: slots,
      });
    } else {
      cp.push(corner);
      co.push(twist);
    }
  });

  const ep: number[] = [];
  const eo: number[] = [];
  EDGE_FACELETS.forEach((slots, position) => {
    const shown = slots.map((slot) => at(faces, slot));
    const edge = EDGE_FACES.findIndex((reference) => sameSet(reference, shown));
    if (edge === -1) {
      errors.push({ code: 'invalid-edge', position: at(EDGES, position), facelets: slots });
    } else {
      ep.push(edge);
      eo.push(sameOrder(shown, at(EDGE_FACES, edge)) ? 0 : 1);
    }
  });
  if (errors.length > 0) return err(errors);

  CORNERS.forEach((name, corner) => {
    const positions = CORNERS.filter((_, position) => cp[position] === corner);
    if (positions.length > 1) errors.push({ code: 'duplicate-corner', corner: name, positions });
  });
  EDGES.forEach((name, edge) => {
    const positions = EDGES.filter((_, position) => ep[position] === edge);
    if (positions.length > 1) errors.push({ code: 'duplicate-edge', edge: name, positions });
  });
  if (errors.length > 0) return err(errors);

  const cube: CubieCube = { cp, co, ep, eo };
  const invariantErrors = checkInvariants(cube);
  return invariantErrors.length > 0 ? err(invariantErrors) : ok(cube);
}
