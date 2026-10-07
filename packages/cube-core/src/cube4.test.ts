import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyLayerTurns, type LayerTurn } from './algorithm.ts';
import {
  applyAlgorithm4,
  applyLayerTurns4,
  cube4ToFacelets,
  isSolved4,
  MOVES_4,
  parseFacelets4,
  randomCube4,
  SOLVED_4,
  STICKERS_4,
  WING_FACELETS,
} from './cube4.ts';
import { FACES, solvedFacelets } from './geometry.ts';
import { Xoshiro128StarStar } from './random.ts';

const turns = fc.constantFrom(1 as const, 2 as const, 3 as const);
const layerTurn: fc.Arbitrary<LayerTurn> = fc
  .tuple(fc.constantFrom(...FACES), fc.constantFrom([1, 1], [2, 2], [1, 2], [1, 3], [3, 3]), turns)
  .map(([face, [from = 1, to = 1], t]) => ({ face, from, to, turns: t }));

describe('4×4×4 pieces', () => {
  it('draws the solved cube', () => {
    expect(cube4ToFacelets(SOLVED_4)).toBe(solvedFacelets(4));
    expect(isSolved4(SOLVED_4)).toBe(true);
  });

  it('has 24 wing slots covering every edge sticker once', () => {
    const facelets = WING_FACELETS.flat();
    expect(new Set(facelets).size).toBe(48);
  });

  it('moves pieces exactly as the stickers move', () => {
    fc.assert(
      fc.property(fc.array(layerTurn, { maxLength: 25 }), (moves) => {
        expect(cube4ToFacelets(applyLayerTurns4(SOLVED_4, moves))).toBe(
          applyLayerTurns(solvedFacelets(4), 4, moves),
        );
      }),
    );
  });

  it('reads back any state from its stickers', () => {
    const rng = Xoshiro128StarStar.fromSeed(4n);
    for (let i = 0; i < 50; i++) {
      const cube = randomCube4(rng);
      const parsed = parseFacelets4(cube4ToFacelets(cube));
      expect(parsed.ok && parsed.value).toEqual(cube);
    }
  });

  it('counts a whole-cube rotation as solved', () => {
    const rotated = applyLayerTurns4(SOLVED_4, [{ face: 'U', from: 1, to: 4, turns: 1 }]);
    expect(isSolved4(rotated)).toBe(true);
    expect(isSolved4(applyLayerTurns4(SOLVED_4, [{ face: 'U', from: 2, to: 2, turns: 1 }]))).toBe(
      false,
    );
  });

  it('rejects stickers no cube can show', () => {
    const solved = solvedFacelets(4);
    const swap = (s: string, i: number, j: number) => {
      const a = s.split('');
      [a[i], a[j]] = [a[j] ?? '', a[i] ?? ''];
      return a.join('');
    };
    expect(parseFacelets4(solved.slice(1)).ok).toBe(false);
    // Two stickers of one corner swapped: a mirrored corner.
    const corner = parseFacelets4(swap(solved, 15, 16));
    expect(!corner.ok && corner.errors.map((e) => e.code)).toEqual(['mirrored-corner']);
    // A wing flipped in place shows exactly what its partner would show there: the partner then
    // appears twice.
    const [ref = 0, other = 0] = WING_FACELETS[0] ?? [];
    const wing = parseFacelets4(swap(solved, ref, other));
    expect(!wing.ok && wing.errors.map((e) => e.code)).toEqual(['duplicate-wing']);
    expect(STICKERS_4).toBe(96);
  });

  it('applies algorithms in WCA notation, wide moves and inner slices included', () => {
    const result = applyAlgorithm4(SOLVED_4, "Rw U2 3Rw' 2R x Uw'");
    expect(result.ok).toBe(true);
    const expected = applyLayerTurns4(SOLVED_4, [
      { face: 'R', from: 1, to: 2, turns: 1 },
      { face: 'U', from: 1, to: 1, turns: 2 },
      { face: 'R', from: 1, to: 3, turns: 3 },
      { face: 'R', from: 2, to: 2, turns: 1 },
      { face: 'R', from: 1, to: 4, turns: 1 },
      { face: 'U', from: 1, to: 2, turns: 3 },
    ]);
    expect(result.ok && result.value).toEqual(expected);
    const middle = applyAlgorithm4(SOLVED_4, 'R M');
    expect(!middle.ok && middle.errors.map((e) => e.code)).toEqual(['layer-out-of-range']);
  });

  it('numbers the solver moves: outer turns in face turn order, then Uw, Rw, Fw', () => {
    expect(MOVES_4).toHaveLength(27);
    expect(MOVES_4[3]).toEqual({ face: 'R', from: 1, to: 1, turns: 1 });
    expect(MOVES_4[22]).toEqual({ face: 'R', from: 1, to: 2, turns: 2 });
  });
});
