// Up to the 24 centre or wing slots of the 4×4×4.
const MAX_N = 24;

const BINOMIAL: readonly (readonly number[])[] = Array.from({ length: MAX_N + 1 }, (_, n) =>
  Array.from({ length: MAX_N + 1 }, (__, k) => {
    let value = 1;
    for (let i = 0; i < k; i++) value = (value * (n - i)) / (i + 1);
    return k > n ? 0 : value;
  }),
);

export function choose(n: number, k: number): number {
  return k < 0 || k > n ? 0 : BINOMIAL[n][k];
}

/** Lehmer-code rank of a permutation of 0..n−1, in 0..n!−1; the identity has rank 0. */
export function rankPermutation(p: ArrayLike<number>, n = p.length): number {
  let rank = 0;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    rank = rank * (n - i) + smaller;
  }
  return rank;
}

export function unrankPermutation(rank: number, n: number, out: number[] | Uint8Array): void {
  // Write the Lehmer digits, then decode in place from the right: each element takes its digit
  // as value, and the elements after it that are not smaller move up by one.
  for (let i = n - 1; i >= 0; i--) {
    out[i] = rank % (n - i);
    rank = Math.floor(rank / (n - i));
  }
  for (let i = n - 2; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) if (out[j] >= out[i]) out[j]++;
  }
}

/**
 * Colex rank of a k-subset given as ascending positions: Σ C(pᵢ, i+1). Subsets of 0..m−1 come
 * first, which keeps the U/D edge coordinates of phase 2 below C(8,4)·4! = 1680.
 */
export function rankCombination(positions: ArrayLike<number>, k = positions.length): number {
  let rank = 0;
  for (let i = 0; i < k; i++) rank += choose(positions[i], i + 1);
  return rank;
}

export function unrankCombination(rank: number, k: number, out: number[] | Uint8Array): void {
  for (let i = k - 1; i >= 0; i--) {
    let p = i;
    while (choose(p + 1, i + 1) <= rank) p++;
    out[i] = p;
    rank -= choose(p, i + 1);
  }
}

export function factorial(n: number): number {
  let value = 1;
  for (let i = 2; i <= n; i++) value *= i;
  return value;
}
