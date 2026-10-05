import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { equals, SOLVED, type CubieCube } from './cubie.ts';
import type { CubeError } from './errors.ts';
import { parseFacelets, SOLVED_FACELETS, toFacelets } from './facelets.ts';
import { FACES } from './geometry.ts';
import { cubieCube } from './testing/arbitraries.ts';
import { at, symbols } from './util.ts';
import { validateCubie } from './validation.ts';

const facelet = (name: string) => FACES.indexOf(name.charAt(0) as 'U') * 9 + Number(name[1]) - 1;

function swap(facelets: string, a: string, b: string): string {
  const chars = symbols(facelets);
  const i = facelet(a);
  const j = facelet(b);
  const first = at(chars, i);
  chars[i] = at(chars, j);
  chars[j] = first;
  return chars.join('');
}

function errorsOf(input: string | readonly string[]): readonly CubeError[] {
  const parsed = parseFacelets(input);
  return parsed.ok ? [] : parsed.errors;
}

const codesOf = (input: string | readonly string[]) => errorsOf(input).map((e) => e.code);

const replaceAt = <T>(items: readonly T[], index: number, value: T): T[] =>
  items.map((item, i) => (i === index ? value : item));

describe('facelet conversion', () => {
  it('maps the solved cube to the solved string', () => {
    expect(toFacelets(SOLVED)).toBe(SOLVED_FACELETS);
    expect(parseFacelets(SOLVED_FACELETS)).toEqual({ ok: true, value: SOLVED });
  });

  it('round-trips every reachable state', () => {
    fc.assert(
      fc.property(cubieCube, (cube) => {
        const parsed = parseFacelets(toFacelets(cube));
        expect(parsed.ok && equals(parsed.value, cube)).toBe(true);
      }),
    );
  });

  it('identifies colours by the centres, whatever symbols they use', () => {
    const names = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
    fc.assert(
      fc.property(cubieCube, fc.shuffledSubarray(names, { minLength: 6 }), (cube, palette) => {
        const colours = symbols(toFacelets(cube)).map((face) =>
          at(palette, FACES.indexOf(face as 'U')),
        );
        const parsed = parseFacelets(colours);
        expect(parsed.ok && equals(parsed.value, cube)).toBe(true);
      }),
    );
  });
});

describe('impossible sticker layouts', () => {
  it('needs exactly 54 stickers', () => {
    expect(errorsOf('UUU')).toEqual([{ code: 'invalid-length', expected: 54, actual: 3 }]);
  });

  it('needs six different centre colours', () => {
    const facelets = replaceAt(symbols(SOLVED_FACELETS), facelet('R5'), 'U');
    expect(errorsOf(facelets)).toEqual([
      { code: 'duplicate-centre-colour', colour: 'U', facelets: [4, 13] },
    ]);
  });

  it('rejects a colour that no centre has', () => {
    const facelets = replaceAt(symbols(SOLVED_FACELETS), facelet('U1'), 'X');
    expect(errorsOf(facelets)).toEqual([{ code: 'unknown-colour', colour: 'X', facelets: [0] }]);
  });

  it('needs nine stickers of each colour', () => {
    const facelets = replaceAt(symbols(SOLVED_FACELETS), facelet('U1'), 'R');
    expect(codesOf(facelets)).toEqual(['colour-count', 'colour-count']);
  });

  it('rejects a corner with two stickers of opposite faces', () => {
    expect(errorsOf(swap(SOLVED_FACELETS, 'R1', 'D2'))).toEqual([
      { code: 'invalid-corner', position: 'URF', facelets: [8, 9, 20] },
    ]);
  });

  it('recognises a corner with two stickers swapped as mirrored', () => {
    expect(errorsOf(swap(SOLVED_FACELETS, 'R1', 'F3'))).toEqual([
      { code: 'mirrored-corner', position: 'URF', corner: 'URF', facelets: [8, 9, 20] },
    ]);
  });

  it('rejects an edge with stickers of opposite faces', () => {
    expect(errorsOf(swap(SOLVED_FACELETS, 'R2', 'D2'))).toEqual([
      { code: 'invalid-edge', position: 'UR', facelets: [5, 10] },
    ]);
  });

  it('rejects the same corner in two places', () => {
    // URF and DBL twice, UBR and DLF missing: the colour counts still add up.
    const cube: CubieCube = { ...SOLVED, cp: [0, 1, 2, 0, 4, 6, 6, 7] };
    expect(errorsOf(toFacelets(cube))).toEqual([
      { code: 'duplicate-corner', corner: 'URF', positions: ['URF', 'UBR'] },
      { code: 'duplicate-corner', corner: 'DBL', positions: ['DLF', 'DBL'] },
    ]);
  });
});

describe('unreachable states', () => {
  const corrupted = (cube: CubieCube, change: (c: CubieCube) => CubieCube) =>
    codesOf(toFacelets(change(cube)));

  it('detects a single twisted corner', () => {
    fc.assert(
      fc.property(cubieCube, fc.integer({ min: 0, max: 7 }), fc.constantFrom(1, 2), (c, i, t) => {
        const codes = corrupted(c, (x) => ({
          ...x,
          co: replaceAt(x.co, i, (at(x.co, i) + t) % 3),
        }));
        expect(codes).toEqual(['twisted-corner']);
      }),
    );
  });

  it('detects a single flipped edge', () => {
    fc.assert(
      fc.property(cubieCube, fc.integer({ min: 0, max: 11 }), (c, i) => {
        const codes = corrupted(c, (x) => ({ ...x, eo: replaceAt(x.eo, i, 1 - at(x.eo, i)) }));
        expect(codes).toEqual(['flipped-edge']);
      }),
    );
  });

  it('detects two swapped pieces', () => {
    const swapped = (values: readonly number[], i: number, j: number) =>
      values.map((v, k) => (k === i ? at(values, j) : k === j ? at(values, i) : v));
    const distinctPair = (size: number) =>
      fc
        .tuple(fc.integer({ min: 0, max: size - 1 }), fc.integer({ min: 1, max: size - 1 }))
        .map(([i, offset]) => [i, (i + offset) % size] as const);
    fc.assert(
      fc.property(cubieCube, distinctPair(8), distinctPair(12), (c, [a, b], [x, y]) => {
        expect(corrupted(c, (s) => ({ ...s, cp: swapped(s.cp, a, b) }))).toEqual(['parity']);
        expect(corrupted(c, (s) => ({ ...s, ep: swapped(s.ep, x, y) }))).toEqual(['parity']);
      }),
    );
  });
});

describe('validateCubie', () => {
  it('accepts every reachable state', () => {
    fc.assert(
      fc.property(cubieCube, (cube) => {
        expect(validateCubie(cube)).toEqual([]);
      }),
    );
  });

  it('reports malformed arrays before group invariants', () => {
    expect(validateCubie({ ...SOLVED, cp: [0, 0, 2, 3, 4, 5, 6, 7] })).toEqual([
      { code: 'malformed-cubies', detail: 'cp is not a permutation of 0..7' },
    ]);
    expect(validateCubie({ ...SOLVED, eo: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })).toEqual([
      { code: 'malformed-cubies', detail: 'eo must hold 12 values in 0..1' },
    ]);
  });
});
