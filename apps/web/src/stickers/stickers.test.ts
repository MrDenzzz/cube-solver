import {
  applyAlgorithm,
  applyAlgorithm4,
  cube4ToFacelets,
  solvedFacelets,
  SOLVED,
  SOLVED_4,
  SOLVED_FACELETS,
  toFacelets,
  WING_FACELETS,
  type Face,
} from '@cube/core';
import { describe, expect, it } from 'vitest';
import { UNKNOWN } from '../scheme.ts';
import {
  BLANK_STICKERS,
  blankStickers,
  checkStickers,
  checkStickers4,
  colourCounts,
  colourForKey,
  isStickers,
  netCell,
  nextSticker,
  paint,
  stickerCount,
  stickerToward,
} from './stickers.ts';

const faceAt = (stickers: string, facelet: number) => stickers.charAt(facelet) as Face;

const scrambled = (() => {
  const result = applyAlgorithm(SOLVED, "R U R' U' F2 D L2 B'");
  if (!result.ok) throw new Error('bad scramble');
  return toFacelets(result.value);
})();

describe('sticker input', () => {
  it('starts with only the centres filled in', () => {
    expect(isStickers(BLANK_STICKERS)).toBe(true);
    expect(checkStickers(BLANK_STICKERS)).toEqual({ kind: 'incomplete', missing: 48 });
    expect(colourCounts(BLANK_STICKERS)).toEqual({ U: 1, R: 1, F: 1, D: 1, L: 1, B: 1 });
  });

  it('never repaints a centre', () => {
    expect(paint(BLANK_STICKERS, 4, 'R')).toBe(BLANK_STICKERS);
    expect(paint(BLANK_STICKERS, 0, 'R').charAt(0)).toBe('R');
  });

  it('accepts a complete valid state and returns its cubies', () => {
    const check = checkStickers(scrambled);
    expect(check.kind).toBe('valid');
    if (check.kind === 'valid') expect(toFacelets(check.cube)).toBe(scrambled);
  });

  it('points at the stickers of an impossible corner', () => {
    // Swapping two stickers of one corner mirrors it.
    const broken = paint(paint(SOLVED_FACELETS, 8, 'R'), 9, 'U');
    const check = checkStickers(broken);
    expect(check.kind).toBe('invalid');
    if (check.kind !== 'invalid') return;
    expect(check.problems).toHaveLength(1);
    expect([...(check.problems[0]?.facelets ?? [])].sort((a, b) => a - b)).toEqual([8, 9, 20]);
  });

  it('rejects strings that are not sticker input', () => {
    expect(isStickers(SOLVED_FACELETS)).toBe(true);
    expect(isStickers(SOLVED_FACELETS.slice(1))).toBe(false);
    expect(isStickers(paint(SOLVED_FACELETS, 0, 'X' as typeof UNKNOWN))).toBe(false);
    expect(isStickers(`${SOLVED_FACELETS.slice(0, 4)}R${SOLVED_FACELETS.slice(5)}`)).toBe(false);
  });

  it('types through a face in reading order, skipping the centre, then moves on', () => {
    expect(nextSticker(18)).toBe(19); // F1 → F2
    expect(nextSticker(21)).toBe(23); // F4 → F6
    expect(nextSticker(26)).toBe(9); // F9 → R1
    expect(nextSticker(17)).toBe(45); // R9 → B1
    expect(nextSticker(35)).toBe(18); // D9 → back to F1
  });

  it('lays the faces out as an unfolded cube and walks across the gaps', () => {
    expect(netCell(0)).toEqual([0, 3]); // U1
    expect(netCell(18)).toEqual([3, 3]); // F1
    expect(netCell(53)).toEqual([5, 11]); // B9
    expect(new Set(Array.from({ length: stickerCount(3) }, (_, i) => netCell(i).join())).size).toBe(
      stickerCount(3),
    );
    expect(stickerToward(6, 1, 0)).toBe(18); // U7 down to F1
    expect(stickerToward(20, 0, 1)).toBe(9); // F3 right to R1
    expect(stickerToward(0, 0, -1)).toBe(0); // nothing left of U1
  });

  it('maps colour initials on English and Russian layouts', () => {
    expect(colourForKey('w')).toBe('U');
    expect(colourForKey('G')).toBe('F');
    expect(colourForKey('с')).toBe('B');
    expect(colourForKey('о')).toBe('L');
    expect(colourForKey('x')).toBeUndefined();
  });

  describe('on the 4×4×4', () => {
    it('starts blank, centres included, and lets every sticker be painted', () => {
      const blank = blankStickers(4);
      expect(blank).toBe('.'.repeat(96));
      expect(isStickers(blank, 4)).toBe(true);
      expect(paint(blank, 5, 'R', 4).charAt(5)).toBe('R');
      expect(checkStickers4(blank)).toEqual({ kind: 'incomplete', missing: 96 });
    });

    it('accepts a scrambled cube and points at a broken wing', () => {
      const scrambled4 = applyAlgorithm4(SOLVED_4, "Rw U2 Fw' L 2R D' Uw2");
      if (!scrambled4.ok) throw new Error('bad scramble');
      const facelets = cube4ToFacelets(scrambled4.value);
      expect(checkStickers4(facelets).kind).toBe('valid');
      // A wing flipped in place shows what its partner shows: the partner is then highlighted
      // as appearing twice.
      const [ref = 0, other = 0] = WING_FACELETS[0] ?? [];
      const solved = solvedFacelets(4);
      const flipped = paint(
        paint(solved, ref, faceAt(solved, other), 4),
        other,
        faceAt(solved, ref),
        4,
      );
      const check = checkStickers4(flipped);
      expect(check.kind === 'invalid' && check.problems.map((p) => p.facelets)).toEqual([
        WING_FACELETS[1],
      ]);
    });

    it('walks the net and types a face in reading order', () => {
      expect(netCell(0, 4)).toEqual([0, 4]);
      expect(new Set(Array.from({ length: 96 }, (_, i) => netCell(i, 4).join())).size).toBe(96);
      expect(nextSticker(32, 4)).toBe(33); // F1 → F2, centres included
      expect(nextSticker(47, 4)).toBe(16); // F16 → R1
      expect(stickerToward(12, 1, 0, 4)).toBe(32); // U13 down to F1
    });
  });
});
