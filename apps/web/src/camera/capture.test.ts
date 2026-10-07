import { describe, expect, it } from 'vitest';
import { IDLE, looksLikeFace, matchingFace, watch, type Watch } from './capture.ts';
import { rotateFace } from './placement.ts';
import { readGrid } from './sample.ts';
import { drawFace, SEEN } from './synthetic.ts';

const SIDE = 120;
const face = (letters: string, size = 3) =>
  readGrid(drawFace(SIDE, SIDE, { letters, size, x: 0, y: 0, side: SIDE }), size);

describe('grid reading', () => {
  it('reads each sticker and the dark gaps between them, ignoring a glare spot', () => {
    const picture = drawFace(SIDE, SIDE, { letters: 'URFDLBUFR', size: 3, x: 0, y: 0, side: SIDE });
    // A glare spot in the middle of the first sticker.
    picture.data.set([255, 255, 255, 255], (20 * SIDE + 20) * 4);
    const reading = readGrid(picture, 3);
    expect(reading.cells.map((c) => c.css)).toEqual(
      'URFDLBUFR'.split('').map((f) => `rgb(${SEEN[f as 'U'].join(' ')})`),
    );
    expect(reading.darkBorders).toBe(1);
    expect(looksLikeFace(reading)).toBe(true);
  });

  it('does not take a wall or a face half out of the grid for a face', () => {
    expect(looksLikeFace(readGrid(drawFace(SIDE, SIDE, null), 3))).toBe(false);
    const shifted = drawFace(SIDE, SIDE, {
      letters: 'URFDLBUFR',
      size: 3,
      x: SIDE / 2,
      y: 0,
      side: SIDE,
    });
    expect(looksLikeFace(readGrid(shifted, 3))).toBe(false);
  });
});

describe('automatic capture', () => {
  it('takes a face once it has held still, and not again in another rotation', () => {
    const first = face('URFDLBUFR');
    let state: Watch = IDLE;
    const verdicts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = watch(state, first, [], 3);
      state = next.state;
      verdicts.push(next.verdict);
    }
    expect(verdicts).toEqual(['steadying', 'steadying', 'take']);

    const again = face(rotateFace('URFDLBUFR', 3, 1));
    expect(matchingFace(again.cells, [first.cells], 3)).toBe(0);
    for (let i = 0; i < 3; i++) state = watch(state, again, [first.cells], 3).state;
    expect(watch(state, again, [first.cells], 3).verdict).toBe('taken-already');
    expect(matchingFace(face('DRFULBUFR').cells, [first.cells], 3)).toBe(-1);
  });

  it('starts over when the picture moves', () => {
    const one = watch(watch(IDLE, face('UUUUUUUUU'), [], 3).state, face('RRRRRRRRR'), [], 3);
    expect(one.state.steady).toBe(1);
  });
});
