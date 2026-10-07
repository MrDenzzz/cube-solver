import { describe, expect, it } from 'vitest';
import { summarise } from './runs.ts';

describe('benchmark summary', () => {
  it('takes the mean length and the middle time, averaging the two middles of an even count', () => {
    const odd = summarise([
      { length: 20, ms: 9 },
      { length: 19, ms: 1 },
      { length: 18, ms: 5 },
    ]);
    expect(odd).toEqual({ count: 3, meanLength: 19, medianMs: 5, maxMs: 9 });
    expect(summarise([...[1, 2, 3, 10].map((ms) => ({ length: 20, ms }))]).medianMs).toBe(2.5);
  });
});
