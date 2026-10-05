import fc from 'fast-check';
import type { CubieCube } from '../cubie.ts';
import { FACE_TURNS, type FaceTurn } from '../moves.ts';
import { permutationParity } from '../util.ts';

export const faceTurn: fc.Arbitrary<FaceTurn> = fc.constantFrom(...FACE_TURNS);

export const faceTurns = (maxLength = 30): fc.Arbitrary<FaceTurn[]> =>
  fc.array(faceTurn, { maxLength });

const permutation = (size: number) =>
  fc.shuffledSubarray(
    Array.from({ length: size }, (_, i) => i),
    { minLength: size, maxLength: size },
  );

const orientations = (count: number, modulus: number) =>
  fc
    .array(fc.integer({ min: 0, max: modulus - 1 }), { minLength: count - 1, maxLength: count - 1 })
    .map((free) => [...free, (modulus - (free.reduce((s, v) => s + v, 0) % modulus)) % modulus]);

/**
 * Any reachable 3×3×3 state, drawn directly from the group description instead of from move
 * sequences, so deep and shallow positions are equally likely.
 */
export const cubieCube: fc.Arbitrary<CubieCube> = fc
  .tuple(permutation(8), permutation(12), orientations(8, 3), orientations(12, 2))
  .map(([cp, ep, co, eo]) => {
    if (permutationParity(cp) !== permutationParity(ep)) {
      const [first = 0, second = 1] = ep;
      ep[0] = second;
      ep[1] = first;
    }
    return { cp, co, ep, eo };
  });
