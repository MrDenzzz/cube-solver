import {
  applyLayerTurns,
  CORNER_FACELETS_4,
  FACES,
  solvedFacelets,
  type Face,
  type Turns,
} from '@cube/core';
import { describe, expect, it } from 'vitest';
import { describeMove, holdCorner } from './guide.ts';

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

describe('holdCorner', () => {
  it('reads the top front right corner, where the 4×4×4 model puts it', () => {
    // Slot 0 is URF, its stickers in the order U, R, F.
    const [u = 0, r = 0, f = 0] = CORNER_FACELETS_4[0] ?? [];
    const marked = solvedFacelets(4)
      .split('')
      .map((c, i) => (i === u ? 'D' : i === r ? 'L' : i === f ? 'B' : c))
      .join('');
    expect(holdCorner(marked, 4)).toEqual({ top: 'D', front: 'B', right: 'L' });
    expect(holdCorner(solvedFacelets(3), 3)).toEqual({ top: 'U', front: 'F', right: 'R' });
  });

  it('names the corner a whole-cube turn brings there', () => {
    // y: the right face comes to the front.
    const turned = applyLayerTurns(solvedFacelets(4), 4, [{ face: 'U', from: 1, to: 4, turns: 1 }]);
    expect(holdCorner(turned, 4)).toEqual({ top: 'U', front: 'R', right: 'B' });
  });
});
