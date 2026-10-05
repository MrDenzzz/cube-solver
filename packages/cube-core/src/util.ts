/** Indexed read that turns a broken invariant into an exception instead of `undefined`. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`Index ${String(index)} is outside 0..${String(items.length - 1)}`);
  }
  return item;
}

/**
 * Splits text into code points. Sticker and face strings use one symbol per sticker, and colour
 * symbols such as 🟥 are single code points, so code points (not graphemes) are the right unit.
 */
export function symbols(text: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- see the doc comment
  return [...text];
}

export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: readonly E[] };

export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

export function err<E>(errors: readonly E[]): {
  readonly ok: false;
  readonly errors: readonly E[];
} {
  return { ok: false, errors };
}

/** Parity of a permutation given as an array of distinct indices: 0 for even, 1 for odd. */
export function permutationParity(permutation: readonly number[]): 0 | 1 {
  const seen = new Array<boolean>(permutation.length).fill(false);
  let parity = 0;
  for (let start = 0; start < permutation.length; start++) {
    if (seen[start] === true) continue;
    let cycleLength = 0;
    for (let i = start; seen[i] !== true; i = at(permutation, i)) {
      seen[i] = true;
      cycleLength++;
    }
    parity += cycleLength - 1;
  }
  return parity % 2 === 0 ? 0 : 1;
}

export function isPermutation(values: readonly number[], size: number): boolean {
  if (values.length !== size) return false;
  const seen = new Array<boolean>(size).fill(false);
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value >= size || seen[value] === true) {
      return false;
    }
    seen[value] = true;
  }
  return true;
}
