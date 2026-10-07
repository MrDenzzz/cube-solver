import { applyAlgorithm, SOLVED, SOLVED_FACELETS, toFacelets } from '@cube/core';
import { describe, expect, it } from 'vitest';
import { UNKNOWN } from '../scheme.ts';
import {
  BLANK_STICKERS,
  checkStickers,
  colourCounts,
  colourForKey,
  errorFacelets,
  isStickers,
  netCell,
  nextSticker,
  paint,
  STICKER_COUNT,
  stickerToward,
} from './stickers.ts';

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
    expect(check.errors.map((e) => e.code)).toEqual(['mirrored-corner']);
    expect([...errorFacelets(check.errors[0] ?? { code: 'parity' })].sort((a, b) => a - b)).toEqual(
      [8, 9, 20],
    );
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
    expect(new Set(Array.from({ length: STICKER_COUNT }, (_, i) => netCell(i).join())).size).toBe(
      STICKER_COUNT,
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
});
