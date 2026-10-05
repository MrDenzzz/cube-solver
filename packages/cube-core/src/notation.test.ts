import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyAlgorithm, expandTo3x3 } from './algorithm.ts';
import { equals, SOLVED, type CubieCube } from './cubie.ts';
import { applyFaceTurns, formatFaceTurns, invertFaceTurns } from './moves.ts';
import { formatAlgorithm, parseAlgorithm, type NotationMode } from './notation.ts';
import { faceTurns } from './testing/arbitraries.ts';

function cubeAfter(text: string, mode: NotationMode = 'extended'): CubieCube {
  const result = applyAlgorithm(SOLVED, text, mode);
  if (!result.ok) throw new Error(`${text}: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function faceTurnsOf(text: string): string {
  const parsed = parseAlgorithm(text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const expanded = expandTo3x3(parsed.value);
  if (!expanded.ok) throw new Error(JSON.stringify(expanded.errors));
  return formatFaceTurns(expanded.value);
}

describe('parseAlgorithm', () => {
  it('reads WCA face moves, outer block moves and rotations', () => {
    const parsed = parseAlgorithm("R U2 F' Rw 2Uw' 3Fw2 x y' z2", 'wca');
    expect(parsed.ok && formatAlgorithm(parsed.value)).toBe("R U2 F' Rw Uw' 3Fw2 x y' z2");
  });

  it('accepts moves without spaces and typographic primes', () => {
    const parsed = parseAlgorithm('RUR’U′R2');
    expect(parsed.ok && formatAlgorithm(parsed.value)).toBe("R U R' U' R2");
  });

  it('reads SiGN in extended mode', () => {
    const parsed = parseAlgorithm("r M' E2 S 2R R2'");
    expect(parsed.ok && formatAlgorithm(parsed.value)).toBe("Rw M' E2 S 2R R2");
  });

  it('rejects SiGN in WCA mode, pointing at each token', () => {
    const parsed = parseAlgorithm("R r M 2R U2'", 'wca');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.map((e) => [e.code, 'token' in e ? e.token : ''])).toEqual([
      ['not-wca', 'r'],
      ['not-wca', 'M'],
      ['not-wca', '2R'],
      ['not-wca', "U2'"],
    ]);
  });

  it('reports unexpected characters and malformed moves with their offsets', () => {
    const parsed = parseAlgorithm('R Q 1Rw 2x');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual([
      { code: 'unexpected-character', start: 2, character: 'Q' },
      { code: 'invalid-move', start: 4, end: 7, token: '1Rw' },
      { code: 'invalid-move', start: 8, end: 10, token: '2x' },
    ]);
  });

  it('round-trips formatted face turn sequences', () => {
    fc.assert(
      fc.property(faceTurns(), (turns) => {
        const text = formatFaceTurns(turns);
        expect(faceTurnsOf(text)).toBe(text);
      }),
    );
  });
});

describe('expandTo3x3', () => {
  it.each([
    ["x U x'", 'F'],
    ['y R', 'B'],
    ['z U', 'L'],
    ['Rw', 'L'],
    ['Rw U', 'L F'],
    ["M'", "L R'"],
    ['M2 U M2', 'L2 R2 D L2 R2'],
    ['E', "D' U"],
    ['S', "F' B"],
    ['x2', ''],
  ])('%s is %s relative to the centres', (algorithm, expected) => {
    expect(faceTurnsOf(algorithm)).toBe(expected);
  });

  it('rejects moves that need layers a 3×3×3 does not have', () => {
    const parsed = parseAlgorithm('R 3Rw 3R');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const expanded = expandTo3x3(parsed.value);
    expect(expanded.ok || expanded.errors.map((e) => [e.code, 'token' in e && e.token])).toEqual([
      ['layer-out-of-range', '3Rw'],
      ['layer-out-of-range', '3R'],
    ]);
  });

  it('agrees with the textbook identities for slices and wide moves', () => {
    const same = (a: string, b: string) => {
      expect(equals(cubeAfter(a), cubeAfter(b))).toBe(true);
    };
    same("Rw R'", "M'");
    same("Uw U'", "E'");
    same("Fw F'", 'S');
    same("x R x'", 'R');
    same("y F y'", 'R');
  });

  it('undoes any face turn sequence with the inverse sequence written in notation', () => {
    fc.assert(
      fc.property(faceTurns(), (turns) => {
        const there = applyFaceTurns(SOLVED, turns);
        const back = applyAlgorithm(there, formatFaceTurns(invertFaceTurns(turns)));
        expect(back.ok && equals(back.value, SOLVED)).toBe(true);
      }),
    );
  });
});
