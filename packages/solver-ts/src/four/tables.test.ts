import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { choose } from '../math.ts';
import { rankMask, rankMask24, unrankMask } from './tables.ts';

describe('mask ranks', () => {
  it('rank the k-subsets of n bits as 0..C(n, k)−1 and back', () => {
    for (const [n, k] of [
      [8, 4],
      [16, 8],
      [24, 8],
    ] as const) {
      for (let rank = 0; rank < choose(n, k); rank += 97) {
        expect(rankMask(unrankMask(rank, k), n)).toBe(rank);
      }
    }
  });

  it('agree byte by byte on 24 bits', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 24 - 1 }), (mask) => {
        expect(rankMask24(mask)).toBe(rankMask(mask, 24));
      }),
    );
  });
});
