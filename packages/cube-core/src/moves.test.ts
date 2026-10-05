import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CORNER_FACELETS,
  CORNERS,
  EDGE_FACELETS,
  EDGES,
  equals,
  inverse,
  isSolved,
  multiply,
  SOLVED,
  type CubieCube,
} from './cubie.ts';
import { toFacelets } from './facelets.ts';
import { FACES, OPPOSITE } from './geometry.ts';
import {
  applyFaceTurns,
  FACE_TURNS,
  faceTurnIndex,
  formatFaceTurns,
  invertFaceTurns,
  MOVE_CUBES,
  type FaceTurn,
} from './moves.ts';
import { cubieCube, faceTurn, faceTurns } from './testing/arbitraries.ts';
import { at } from './util.ts';

const facelet = (name: string) => FACES.indexOf(name[0] as 'U') * 9 + Number(name.slice(1)) - 1;
const corners = (...names: string[]) => names.map((n) => CORNERS.indexOf(n as 'URF'));
const edges = (...names: string[]) => names.map((n) => EDGES.indexOf(n as 'UR'));

const parse = (text: string): FaceTurn[] =>
  text.split(' ').map((token) => {
    const turn = FACE_TURNS.find((t) => formatFaceTurns([t]) === token);
    if (turn === undefined) throw new Error(`Bad token ${token}`);
    return turn;
  });

const apply = (text: string, cube: CubieCube = SOLVED) => applyFaceTurns(cube, parse(text));

// Reference data from Kociemba's two-phase solver (defs.py and cubie.py), used here only as test
// fixtures: https://github.com/hkociemba/RubiksCube-TwophaseSolver
describe('agreement with Kociemba conventions', () => {
  it('derives the corner and edge facelet tables', () => {
    // prettier-ignore
    const cornerFacelet = [
      ['U9', 'R1', 'F3'], ['U7', 'F1', 'L3'], ['U1', 'L1', 'B3'], ['U3', 'B1', 'R3'],
      ['D3', 'F9', 'R7'], ['D1', 'L9', 'F7'], ['D7', 'B9', 'L7'], ['D9', 'R9', 'B7'],
    ];
    // prettier-ignore
    const edgeFacelet = [
      ['U6', 'R2'], ['U8', 'F2'], ['U4', 'L2'], ['U2', 'B2'], ['D6', 'R8'], ['D2', 'F8'],
      ['D4', 'L8'], ['D8', 'B8'], ['F6', 'R4'], ['F4', 'L6'], ['B6', 'L4'], ['B4', 'R6'],
    ];
    expect(CORNER_FACELETS).toEqual(cornerFacelet.map((c) => c.map(facelet)));
    expect(EDGE_FACELETS).toEqual(edgeFacelet.map((e) => e.map(facelet)));
  });

  it('derives the six quarter turns', () => {
    const reference: Record<string, CubieCube> = {
      U: {
        cp: corners('UBR', 'URF', 'UFL', 'ULB', 'DFR', 'DLF', 'DBL', 'DRB'),
        co: [0, 0, 0, 0, 0, 0, 0, 0],
        ep: edges('UB', 'UR', 'UF', 'UL', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'),
        eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      R: {
        cp: corners('DFR', 'UFL', 'ULB', 'URF', 'DRB', 'DLF', 'DBL', 'UBR'),
        co: [2, 0, 0, 1, 1, 0, 0, 2],
        ep: edges('FR', 'UF', 'UL', 'UB', 'BR', 'DF', 'DL', 'DB', 'DR', 'FL', 'BL', 'UR'),
        eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      F: {
        cp: corners('UFL', 'DLF', 'ULB', 'UBR', 'URF', 'DFR', 'DBL', 'DRB'),
        co: [1, 2, 0, 0, 2, 1, 0, 0],
        ep: edges('UR', 'FL', 'UL', 'UB', 'DR', 'FR', 'DL', 'DB', 'UF', 'DF', 'BL', 'BR'),
        eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
      },
      D: {
        cp: corners('URF', 'UFL', 'ULB', 'UBR', 'DLF', 'DBL', 'DRB', 'DFR'),
        co: [0, 0, 0, 0, 0, 0, 0, 0],
        ep: edges('UR', 'UF', 'UL', 'UB', 'DF', 'DL', 'DB', 'DR', 'FR', 'FL', 'BL', 'BR'),
        eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      L: {
        cp: corners('URF', 'ULB', 'DBL', 'UBR', 'DFR', 'UFL', 'DLF', 'DRB'),
        co: [0, 1, 2, 0, 0, 2, 1, 0],
        ep: edges('UR', 'UF', 'BL', 'UB', 'DR', 'DF', 'FL', 'DB', 'FR', 'UL', 'DL', 'BR'),
        eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      B: {
        cp: corners('URF', 'UFL', 'UBR', 'DRB', 'DFR', 'DLF', 'ULB', 'DBL'),
        co: [0, 0, 1, 2, 0, 0, 2, 1],
        ep: edges('UR', 'UF', 'UL', 'BR', 'DR', 'DF', 'DL', 'BL', 'FR', 'FL', 'UB', 'DB'),
        eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
      },
    };
    for (const face of FACES) {
      expect(at(MOVE_CUBES, faceTurnIndex({ face, turns: 1 }))).toEqual(reference[face]);
    }
  });
});

describe('group structure', () => {
  it('returns to the start after a move sequence and its inverse', () => {
    fc.assert(
      fc.property(cubieCube, faceTurns(), (cube, turns) => {
        const there = applyFaceTurns(cube, turns);
        expect(applyFaceTurns(there, invertFaceTurns(turns))).toEqual(cube);
      }),
    );
  });

  it('has order four for every quarter turn', () => {
    fc.assert(
      fc.property(cubieCube, faceTurn, (cube, turn) => {
        const quarter = { face: turn.face, turns: 1 } as const;
        expect(applyFaceTurns(cube, [quarter, quarter, quarter, quarter])).toEqual(cube);
      }),
    );
  });

  it('lets opposite faces commute', () => {
    fc.assert(
      fc.property(cubieCube, faceTurn, (cube, turn) => {
        const other = { face: OPPOSITE[turn.face], turns: turn.turns };
        expect(applyFaceTurns(cube, [turn, other])).toEqual(applyFaceTurns(cube, [other, turn]));
      }),
    );
  });

  it('multiplies associatively and inverts', () => {
    fc.assert(
      fc.property(cubieCube, cubieCube, cubieCube, (a, b, c) => {
        expect(multiply(multiply(a, b), c)).toEqual(multiply(a, multiply(b, c)));
        expect(isSolved(multiply(a, inverse(a)))).toBe(true);
        expect(isSolved(multiply(inverse(a), a))).toBe(true);
      }),
    );
  });

  it('matches the known orders of R U R′ U′ (6) and R U (105)', () => {
    const order = (text: string) => {
      const step = apply(text);
      let cube = step;
      let n = 1;
      while (!isSolved(cube)) {
        cube = multiply(cube, step);
        n++;
      }
      return n;
    };
    expect(order("R U R' U'")).toBe(6);
    expect(order('R U')).toBe(105);
  });
});

describe('superflip', () => {
  const superflip: CubieCube = { ...SOLVED, eo: new Array<number>(12).fill(1) };
  // Facelet string from Kociemba's optimal solver README; the two maneuvers are 20-move
  // superflip solutions from cube20.org and from that README.
  const facelets = 'UBULURUFURURFRBRDRFUFLFRFDFDFDLDRDBDLULBLFLDLBUBRBLBDB';

  it.each([
    "R L U2 F U' D F2 R2 B2 L U2 F' B' U R2 D F2 U R2 U",
    "U R U2 R F2 L U2 R F' B' R2 D R' L U2 F2 D2 F R2 D",
  ])('is produced by %s', (maneuver) => {
    const cube = apply(maneuver);
    expect(equals(cube, superflip)).toBe(true);
    expect(toFacelets(cube)).toBe(facelets);
  });
});
