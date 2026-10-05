import type { CubieCube } from './cubie.ts';
import type { CubeError } from './errors.ts';
import { isPermutation, permutationParity } from './util.ts';

const sum = (values: readonly number[]) => values.reduce((s, v) => s + v, 0);

/**
 * The three invariants of the 3×3×3 group: total corner twist ≡ 0 (mod 3), total edge flip
 * ≡ 0 (mod 2), and equal corner and edge permutation parity. Each failure corresponds to one
 * physical defect: a twisted corner, a flipped edge, two swapped pieces.
 */
export function checkInvariants(cube: CubieCube): CubeError[] {
  const errors: CubeError[] = [];
  const twist = sum(cube.co) % 3;
  if (twist === 1 || twist === 2) errors.push({ code: 'twisted-corner', twist });
  if (sum(cube.eo) % 2 !== 0) errors.push({ code: 'flipped-edge' });
  if (permutationParity(cube.cp) !== permutationParity(cube.ep)) errors.push({ code: 'parity' });
  return errors;
}

/** Structural checks for a CubieCube built in code, followed by the group invariants. */
export function validateCubie(cube: CubieCube): CubeError[] {
  const malformed = (detail: string): CubeError[] => [{ code: 'malformed-cubies', detail }];
  if (!isPermutation(cube.cp, 8)) return malformed('cp is not a permutation of 0..7');
  if (!isPermutation(cube.ep, 12)) return malformed('ep is not a permutation of 0..11');
  if (cube.co.length !== 8 || !cube.co.every((o) => o === 0 || o === 1 || o === 2)) {
    return malformed('co must hold 8 values in 0..2');
  }
  if (cube.eo.length !== 12 || !cube.eo.every((o) => o === 0 || o === 1)) {
    return malformed('eo must hold 12 values in 0..1');
  }
  return checkInvariants(cube);
}
