import type { CubieCube } from './cubie.ts';
import { at, permutationParity } from './util.ts';

/** A source of uniformly distributed unsigned 32-bit integers. */
export interface Rng {
  nextU32(): number;
}

const MASK64 = (1n << 64n) - 1n;

/**
 * SplitMix64, used only to expand a seed into generator state, as recommended by the xoshiro
 * authors. Reference: https://prng.di.unimi.it/splitmix64.c
 */
export function splitMix64(seed: bigint): () => bigint {
  let x = BigInt.asUintN(64, seed);
  return () => {
    x = (x + 0x9e3779b97f4a7c15n) & MASK64;
    let z = x;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return z ^ (z >> 31n);
  };
}

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

/**
 * xoshiro128** 1.1 (https://prng.di.unimi.it/xoshiro128starstar.c): 32-bit operations only, so the
 * TypeScript and Rust engines produce identical streams without 64-bit arithmetic on the hot path.
 */
export class Xoshiro128StarStar implements Rng {
  #s0: number;
  #s1: number;
  #s2: number;
  #s3: number;

  constructor([s0, s1, s2, s3]: readonly [number, number, number, number]) {
    this.#s0 = s0 >>> 0;
    this.#s1 = s1 >>> 0;
    this.#s2 = s2 >>> 0;
    this.#s3 = s3 >>> 0;
  }

  /** State words are the low and high halves of the first two SplitMix64 outputs. */
  static fromSeed(seed: number | bigint): Xoshiro128StarStar {
    const next = splitMix64(BigInt(seed));
    const a = next();
    const b = next();
    const lo = (v: bigint) => Number(v & 0xffffffffn);
    const hi = (v: bigint) => Number(v >> 32n);
    return new Xoshiro128StarStar([lo(a), hi(a), lo(b), hi(b)]);
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.#s1, 5), 7), 9) >>> 0;
    const t = this.#s1 << 9;
    this.#s2 = (this.#s2 ^ this.#s0) >>> 0;
    this.#s3 = (this.#s3 ^ this.#s1) >>> 0;
    this.#s1 = (this.#s1 ^ this.#s2) >>> 0;
    this.#s0 = (this.#s0 ^ this.#s3) >>> 0;
    this.#s2 = (this.#s2 ^ t) >>> 0;
    this.#s3 = rotl(this.#s3, 11);
    return result;
  }
}

/**
 * Uniform integer in 0..n−1. Rejects the lowest (2³² mod n) values, which would otherwise make
 * small results slightly more likely.
 */
export function nextBelow(rng: Rng, n: number): number {
  const threshold = (2 ** 32 - n) % n;
  for (;;) {
    const x = rng.nextU32();
    if (x >= threshold) return x % n;
  }
}

function shuffle(rng: Rng, items: number[]): number[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextBelow(rng, i + 1);
    const item = at(items, i);
    items[i] = at(items, j);
    items[j] = item;
  }
  return items;
}

function orientations(rng: Rng, count: number, modulus: number): number[] {
  const free = Array.from({ length: count - 1 }, () => nextBelow(rng, modulus));
  const total = free.reduce((s, v) => s + v, 0);
  return [...free, (modulus - (total % modulus)) % modulus];
}

/**
 * A uniformly random reachable state. The order of generator calls is part of the contract (the
 * Rust engine repeats it): corner shuffle, edge shuffle, then 7 corner twists and 11 edge flips.
 * Matching parities by swapping the first two edges maps odd edge permutations one-to-one onto
 * even ones, so uniformity is preserved.
 */
export function randomCube(rng: Rng): CubieCube {
  const cp = shuffle(
    rng,
    Array.from({ length: 8 }, (_, i) => i),
  );
  const ep = shuffle(
    rng,
    Array.from({ length: 12 }, (_, i) => i),
  );
  if (permutationParity(cp) !== permutationParity(ep)) {
    const first = at(ep, 0);
    ep[0] = at(ep, 1);
    ep[1] = first;
  }
  const co = orientations(rng, 8, 3);
  const eo = orientations(rng, 12, 2);
  return { cp, co, ep, eo };
}
