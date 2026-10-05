import { describe, expect, it } from 'vitest';
import {
  choose,
  factorial,
  rankCombination,
  rankPermutation,
  unrankCombination,
  unrankPermutation,
} from './math.ts';

describe('permutation ranks', () => {
  it('is a bijection between all permutations of 8 and 0..8!−1', () => {
    const p = new Uint8Array(8);
    for (let rank = 0; rank < factorial(8); rank++) {
      unrankPermutation(rank, 8, p);
      expect(new Set(p).size).toBe(8);
      expect(rankPermutation(p)).toBe(rank);
    }
  });

  it('ranks the identity as 0', () => {
    expect(rankPermutation([0, 1, 2, 3, 4, 5, 6, 7])).toBe(0);
  });
});

describe('combination ranks', () => {
  it('is a bijection between 4-subsets of 0..11 and 0..C(12,4)−1, in ascending order', () => {
    const positions = new Uint8Array(4);
    expect(choose(12, 4)).toBe(495);
    for (let rank = 0; rank < 495; rank++) {
      unrankCombination(rank, 4, positions);
      expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
      expect(new Set(positions).size).toBe(4);
      expect(Math.max(...positions)).toBeLessThan(12);
      expect(rankCombination(positions)).toBe(rank);
    }
  });

  it('puts the subsets of 0..7 first', () => {
    const positions = new Uint8Array(4);
    for (let rank = 0; rank < choose(8, 4); rank++) {
      unrankCombination(rank, 4, positions);
      expect(Math.max(...positions)).toBeLessThan(8);
    }
  });
});
