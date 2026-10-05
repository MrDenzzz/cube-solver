import { multiply, SOLVED, type CubieCube } from './cubie.ts';
import { parseFacelets, SOLVED_FACELETS } from './facelets.ts';
import { FACES, layerTurnPermutation, permute, type Face } from './geometry.ts';
import { at, symbols } from './util.ts';

/** Clockwise quarter turns as seen from outside the face: 1 = X, 2 = X2, 3 = X'. */
export type Turns = 1 | 2 | 3;

export interface FaceTurn {
  readonly face: Face;
  readonly turns: Turns;
}

const TURN_COUNTS = [1, 2, 3] as const;

/** The 18 face turns in Kociemba's move order: U, U2, U', R, R2, R', F, …, B'. */
export const FACE_TURNS: readonly FaceTurn[] = FACES.flatMap((face) =>
  TURN_COUNTS.map((turns) => ({ face, turns })),
);

export function faceTurnIndex(turn: FaceTurn): number {
  return FACES.indexOf(turn.face) * 3 + turn.turns - 1;
}

// Derived from the sticker geometry rather than typed in, then checked against Kociemba's
// published tables in the tests.
function quarterTurn(face: Face): CubieCube {
  const facelets = permute(symbols(SOLVED_FACELETS), layerTurnPermutation(3, face, 1, 1));
  const parsed = parseFacelets(facelets);
  if (!parsed.ok) throw new Error(`Quarter turn of ${face} is not a valid cube state`);
  return parsed.value;
}

function power(cube: CubieCube, exponent: number): CubieCube {
  let result = SOLVED;
  for (let i = 0; i < exponent; i++) result = multiply(result, cube);
  return result;
}

/** Cubie effect of each face turn, indexed by {@link faceTurnIndex}. */
export const MOVE_CUBES: readonly CubieCube[] = FACES.flatMap((face) => {
  const quarter = quarterTurn(face);
  return TURN_COUNTS.map((turns) => power(quarter, turns));
});

export function applyFaceTurn(cube: CubieCube, turn: FaceTurn): CubieCube {
  return multiply(cube, at(MOVE_CUBES, faceTurnIndex(turn)));
}

export function applyFaceTurns(cube: CubieCube, turns: readonly FaceTurn[]): CubieCube {
  return turns.reduce(applyFaceTurn, cube);
}

export function invertFaceTurns(turns: readonly FaceTurn[]): FaceTurn[] {
  return turns.toReversed().map(({ face, turns: t }) => ({ face, turns: inverseTurns(t) }));
}

export function inverseTurns(turns: Turns): Turns {
  return turns === 1 ? 3 : turns === 3 ? 1 : 2;
}

const SUFFIX: Readonly<Record<Turns, string>> = { 1: '', 2: '2', 3: "'" };

export function formatFaceTurns(turns: readonly FaceTurn[]): string {
  return turns.map(({ face, turns: t }) => face + SUFFIX[t]).join(' ');
}

/** Half-turn metric: every face turn counts as one move. */
export function htm(turns: readonly FaceTurn[]): number {
  return turns.length;
}

/** Quarter-turn metric: a half turn counts as two moves. */
export function qtm(turns: readonly FaceTurn[]): number {
  return turns.reduce((count, { turns: t }) => count + (t === 2 ? 2 : 1), 0);
}
