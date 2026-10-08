import type { Face } from '@cube/core';
import { describe, expect, it } from 'vitest';
import { IDLE, matchingFace, watch, type Watch } from './capture.ts';
import { srgbToLab } from './colour.ts';
import { rotateFace } from './placement.ts';
import { sampleAt, type CellColour } from './sample.ts';
import { drawFace, SEEN } from './synthetic.ts';

const cells = (letters: string): CellColour[] =>
  letters.split('').map((f) => {
    const [r, g, b] = SEEN[f as Face];
    return { rgb: [r, g, b], lab: srgbToLab(r, g, b), css: '', spread: 0 };
  });

describe('reading a sticker', () => {
  it('takes the median, so a glare spot does not change the colour', () => {
    const picture = drawFace(120, 120, { letters: 'RRRRRRRRR', size: 3, x: 0, y: 0, side: 120 });
    picture.data.set([255, 255, 255, 255], (20 * 120 + 20) * 4);
    expect(sampleAt(picture, 20, 20, 8).css).toBe(`rgb(${SEEN.R.join(' ')})`);
  });
});

describe('automatic capture', () => {
  it('takes a face once it has held still, and not again in another rotation', () => {
    const first = cells('URFDLBUFR');
    let state: Watch = IDLE;
    const verdicts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = watch(state, first, [], 3);
      state = next.state;
      verdicts.push(next.verdict);
    }
    expect(verdicts).toEqual(['steadying', 'steadying', 'take']);

    const again = cells(rotateFace('URFDLBUFR', 3, 1));
    expect(matchingFace(again, [first], 3)).toBe(0);
    for (let i = 0; i < 3; i++) state = watch(state, again, [first], 3).state;
    expect(watch(state, again, [first], 3).verdict).toBe('taken-already');
    expect(matchingFace(cells('DRFULBUFR'), [first], 3)).toBe(-1);
  });

  it('starts over when the face changes or is lost', () => {
    const moved = watch(watch(IDLE, cells('UUUUUUUUU'), [], 3).state, cells('RRRRRRRRR'), [], 3);
    expect(moved.state.steady).toBe(1);
    expect(watch(moved.state, null, [], 3)).toEqual({ state: IDLE, verdict: 'none' });
  });
});
