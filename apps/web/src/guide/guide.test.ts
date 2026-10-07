import { FACES, type Face, type Turns } from '@cube/core';
import { describe, expect, it } from 'vitest';
import { describeMove } from './guide.ts';

const outer = (face: Face, turns: Turns) => describeMove({ face, from: 1, to: 1, turns }, 3);

describe('describeMove', () => {
  it('says where the front or top goes, matching how cubers learn the moves', () => {
    const towards = (face: Face) => {
      const { reference, towards: to } = outer(face, 1);
      return `${reference}→${to}`;
    };
    expect(towards('R')).toBe('F→U');
    expect(towards('L')).toBe('F→D');
    expect(towards('U')).toBe('F→L');
    expect(towards('D')).toBe('F→R');
    expect(towards('F')).toBe('U→R');
    expect(towards('B')).toBe('U→L');
  });

  it('reverses the direction for a prime move', () => {
    for (const face of FACES) {
      const quarter = outer(face, 1);
      const prime = outer(face, 3);
      expect(prime.reference).toBe(quarter.reference);
      expect(prime.towards).not.toBe(quarter.towards);
      expect(prime.clockwise).toBe(false);
    }
  });

  it('names moves in WCA notation, wide moves included', () => {
    expect(outer('R', 3).notation).toBe("R'");
    expect(outer('U', 2).half).toBe(true);
    const wide = describeMove({ face: 'R', from: 1, to: 2, turns: 2 }, 4);
    expect(wide.notation).toBe('Rw2');
    expect(wide.depth).toBe(2);
  });
});
