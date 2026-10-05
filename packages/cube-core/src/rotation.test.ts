import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyAlgorithm } from './algorithm.ts';
import { equals, SOLVED } from './cubie.ts';
import { FACES } from './geometry.ts';
import { applyFaceTurns, formatFaceTurns } from './moves.ts';
import { rotateCube, rotateFace } from './rotation.ts';
import { cubieCube, faceTurns } from './testing/arbitraries.ts';

const axis = fc.constantFrom(...FACES);
const turns = fc.constantFrom(1 as const, 2 as const, 3 as const);

describe('rotateCube', () => {
  it('moves faces as x, y and z do', () => {
    expect(rotateFace('F', 'R', 1)).toBe('U');
    expect(rotateFace('R', 'U', 1)).toBe('F');
    expect(rotateFace('U', 'F', 1)).toBe('R');
  });

  it('agrees with rotations written in notation', () => {
    fc.assert(
      fc.property(faceTurns(), (moves) => {
        // Turning the cube with x and then applying moves is the same as applying the moves
        // with faces relabelled, relative to the centres.
        const viaNotation = applyAlgorithm(SOLVED, `x ${formatFaceTurns(moves)}`);
        const rotated = applyFaceTurns(
          SOLVED,
          moves.map(({ face, turns: t }) => ({ face: rotateFace(face, 'R', 3), turns: t })),
        );
        expect(viaNotation.ok && equals(viaNotation.value, rotated)).toBe(true);
      }),
    );
  });

  it('is conjugation: solving the rotated cube and mapping faces back solves the original', () => {
    fc.assert(
      fc.property(cubieCube, axis, turns, faceTurns(), (cube, a, t, moves) => {
        const rotated = applyFaceTurns(rotateCube(cube, a, t), moves);
        const mappedBack = moves.map(({ face, turns: k }) => ({
          face: rotateFace(face, a, t === 1 ? 3 : t === 3 ? 1 : 2),
          turns: k,
        }));
        expect(equals(rotated, rotateCube(applyFaceTurns(cube, mappedBack), a, t))).toBe(true);
      }),
    );
  });
});
