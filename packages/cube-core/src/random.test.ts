import { describe, expect, it } from 'vitest';
import { randomCube, splitMix64, Xoshiro128StarStar, nextBelow } from './random.ts';
import { validateCubie } from './validation.ts';

// Reference outputs from the rand_xoshiro crate's tests, which were produced with the C reference
// implementations: https://github.com/rust-random/rngs/tree/master/rand_xoshiro/src
describe('generators', () => {
  it('matches the SplitMix64 reference stream', () => {
    const next = splitMix64(1477776061723855037n);
    expect([next(), next(), next(), next(), next()]).toEqual([
      1985237415132408290n,
      2979275885539914483n,
      13511426838097143398n,
      8488337342461049707n,
      15141737807933549159n,
    ]);
  });

  it('matches the xoshiro128** 1.1 reference stream', () => {
    const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
    expect(Array.from({ length: 10 }, () => rng.nextU32())).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597,
      4258142804,
    ]);
  });

  it('is reproducible from a seed', () => {
    const a = Xoshiro128StarStar.fromSeed(42);
    const b = Xoshiro128StarStar.fromSeed(42n);
    expect(Array.from({ length: 5 }, () => a.nextU32())).toEqual(
      Array.from({ length: 5 }, () => b.nextU32()),
    );
  });

  it('draws every value below n about equally often', () => {
    const rng = Xoshiro128StarStar.fromSeed(7);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60_000; i++) {
      const value = nextBelow(rng, 6);
      counts[value] = (counts[value] ?? 0) + 1;
    }
    for (const count of counts) expect(count).toBeGreaterThan(9_000);
  });
});

describe('randomCube', () => {
  it('only produces reachable states', () => {
    const rng = Xoshiro128StarStar.fromSeed(1);
    for (let i = 0; i < 1_000; i++) expect(validateCubie(randomCube(rng))).toEqual([]);
  });

  it('gives the same sequence of cubes for the same seed', () => {
    const cubes = (seed: number) => {
      const rng = Xoshiro128StarStar.fromSeed(seed);
      return Array.from({ length: 20 }, () => randomCube(rng));
    };
    expect(cubes(3)).toEqual(cubes(3));
    expect(cubes(3)).not.toEqual(cubes(4));
  });
});
