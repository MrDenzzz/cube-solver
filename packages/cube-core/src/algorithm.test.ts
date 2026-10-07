import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyLayerTurns, toLayerTurn, toMove, type LayerTurn } from './algorithm.ts';
import { SOLVED } from './cubie.ts';
import { SOLVED_FACELETS, toFacelets } from './facelets.ts';
import { FACES, solvedFacelets } from './geometry.ts';
import { applyFaceTurns } from './moves.ts';
import { faceTurns } from './testing/arbitraries.ts';

const turns = fc.constantFrom(1 as const, 2 as const, 3 as const);

const layerTurn = (size: number): fc.Arbitrary<LayerTurn> =>
  fc
    .tuple(fc.constantFrom(...FACES), fc.integer({ min: 1, max: size }), turns)
    .chain(([face, from, t]) =>
      fc.integer({ min: from, max: size }).map((to) => ({ face, from, to, turns: t })),
    );

describe('applyLayerTurns', () => {
  it('agrees with the cubie model on the 3×3×3', () => {
    fc.assert(
      fc.property(faceTurns(), (moves) => {
        const viaStickers = applyLayerTurns(
          SOLVED_FACELETS,
          3,
          moves.map(({ face, turns: t }) => ({ face, from: 1, to: 1, turns: t })),
        );
        expect(viaStickers).toBe(toFacelets(applyFaceTurns(SOLVED, moves)));
      }),
    );
  });

  it('undoes a 4×4×4 layer turn with the opposite turn', () => {
    fc.assert(
      fc.property(fc.array(layerTurn(4), { maxLength: 12 }), (moves) => {
        const undo = moves.toReversed().map((m) => ({ ...m, turns: (4 - m.turns) as 1 | 2 | 3 }));
        expect(applyLayerTurns(solvedFacelets(4), 4, [...moves, ...undo])).toBe(solvedFacelets(4));
      }),
    );
  });

  it('keeps placeholder symbols for stickers not entered yet', () => {
    const partial = `${'.'.repeat(4)}U${'.'.repeat(49)}`;
    expect(applyLayerTurns(partial, 3, [{ face: 'R', from: 1, to: 1, turns: 1 }])).toBe(partial);
  });
});

describe('toMove', () => {
  // One distinct symbol per sticker, so equal strings mean equal sticker permutations.
  const labelled = (size: number) =>
    Array.from({ length: 6 * size * size }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');

  it('names a move that turns exactly the same layers', () => {
    for (const size of [3, 4, 5]) {
      for (const face of FACES) {
        for (let from = 1; from <= size; from++) {
          for (let to = from; to <= size; to++) {
            if (from !== 1 && to !== size && from !== to) continue;
            const turn: LayerTurn = { face, from, to, turns: 1 };
            const named = toLayerTurn(toMove(turn, size), size);
            expect(named).toBeDefined();
            if (named === undefined) continue;
            expect(applyLayerTurns(labelled(size), size, [named])).toBe(
              applyLayerTurns(labelled(size), size, [turn]),
            );
          }
        }
      }
    }
  });

  it('writes the far layer from the opposite face', () => {
    expect(toMove({ face: 'R', from: 3, to: 3, turns: 1 }, 3)).toEqual({
      kind: 'block',
      face: 'L',
      depth: 1,
      turns: 3,
    });
  });

  it('rejects inner blocks, which have no single name', () => {
    expect(() => toMove({ face: 'R', from: 2, to: 3, turns: 1 }, 5)).toThrow(RangeError);
  });
});
