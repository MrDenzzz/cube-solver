import { describe, expect, it } from 'vitest';
import { detectFace } from './detect.ts';
import { rotateGrid } from './placement.ts';
import type { Pixels } from './sample.ts';
import { drawFace, SEEN, type Clutter, type Rgb } from './synthetic.ts';

const WIDTH = 400;
const HEIGHT = 300;
const css = ([r, g, b]: Rgb) => `rgb(${String(r)} ${String(g)} ${String(b)})`;

/** Whether the read cells are the face's stickers in some rotation. */
function readsAs(cells: readonly { css: string }[] | undefined, letters: string, size: number) {
  const expected = letters.split('').map((f) => css(SEEN[f as keyof typeof SEEN]));
  return [0, 1, 2, 3].some((t) => {
    const turned = rotateGrid(expected, size, t);
    return cells?.every((cell, i) => cell.css === turned[i]) ?? false;
  });
}

/** Paints a rectangle over a picture: a seam the camera blurred away, or a logo. */
function paint(picture: Pixels, colour: Rgb, x: number, y: number, width: number, height: number) {
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      picture.data.set(colour, (row * picture.width + column) * 4);
    }
  }
}

const CLUTTER: readonly Clutter[] = [
  { x: 10, y: 10, width: 60, height: 120, colour: [200, 160, 140] },
  { x: 330, y: 200, width: 50, height: 50, colour: [90, 140, 200] },
  { x: 300, y: 20, width: 80, height: 30, colour: [230, 230, 220] },
];

describe('finding a face in the picture', () => {
  const cases = [
    { name: 'centred and upright', x: 120, y: 70, side: 160, angle: 0 },
    { name: 'small and off to one side', x: 60, y: 150, side: 110, angle: 0 },
    { name: 'turned by 20°', x: 140, y: 60, side: 150, angle: 0.35 },
    { name: 'turned by 40°', x: 130, y: 70, side: 140, angle: -0.7 },
    { name: 'large', x: 70, y: 20, side: 260, angle: 0.1 },
  ];
  for (const size of [3, 4] as const) {
    const letters = size === 3 ? 'URFDLBUFR' : 'URFDLBUFRDDBLLUR';
    for (const { name, ...placement } of cases) {
      it(`reads a ${String(size)}×${String(size)} face ${name}, among clutter`, () => {
        const picture = drawFace(WIDTH, HEIGHT, { letters, size, ...placement }, () => 0, CLUTTER);
        const found = detectFace(picture, size);
        expect(found).not.toBeNull();
        expect(readsAs(found?.cells, letters, size)).toBe(true);
      });
    }
  }

  for (const size of [3, 4] as const) {
    it(`reads a stickerless ${String(size)}×${String(size)} face, seams and all`, () => {
      // Blue next to blue and white next to white: seams a shade darker, not black.
      const letters = size === 3 ? 'BBUUUFRRD' : 'BBUULLLFRRRDDDBB';
      const face = { letters, size, x: 110, y: 60, side: 180, angle: 0.15, stickerless: true };
      const found = detectFace(
        drawFace(WIDTH, HEIGHT, face, () => 0, CLUTTER),
        size,
      );
      expect(readsAs(found?.cells, letters, size)).toBe(true);
    });
  }

  it('fills in neighbours whose seams the camera blurred into one patch', () => {
    // Three reds in an L with no seam between them, as a webcam blurs red next to orange: a
    // patch of no sticker's shape, found by the lattice of the other six.
    const letters = 'UFBRRDRLF';
    const face = { letters, size: 3, x: 110, y: 60, side: 180, stickerless: true };
    const picture = drawFace(WIDTH, HEIGHT, face, () => 0, CLUTTER);
    paint(picture, SEEN.R, 112, 122, 116, 56);
    paint(picture, SEEN.R, 112, 122, 56, 116);
    expect(readsAs(detectFace(picture, 3)?.cells, letters, 3)).toBe(true);
  });

  it('fills in a sticker with a logo among merged neighbours', () => {
    // Four white pieces of a stickerless 4×4×4 run into one patch, as light seams between white
    // pieces do on a webcam, and the logo on one of them covers most of its middle.
    const letters = 'RBLBFUFRBFUUDUUL';
    const face = { letters, size: 4, x: 100, y: 40, side: 220, stickerless: true };
    const picture = drawFace(WIDTH, HEIGHT, face, () => 0, CLUTTER);
    paint(picture, SEEN.U, 212, 152, 106, 51);
    paint(picture, SEEN.U, 157, 207, 106, 51);
    paint(picture, SEEN.U, 212, 152, 51, 106);
    // As wide as most of the piece, as on the webcam: it covers most of the sticker's middle.
    paint(picture, [40, 40, 40], 223, 170, 30, 16);
    expect(readsAs(detectFace(picture, 4)?.cells, letters, 4)).toBe(true);
  });

  it('does not take part of a 4×4×4 face for a 3×3×3 one', () => {
    const face = { letters: 'URFDLBUFRDDBLLUR', size: 4, x: 100, y: 50, side: 200 };
    expect(detectFace(drawFace(WIDTH, HEIGHT, face), 3)).toBeNull();
  });

  it('finds nothing in a room without a cube', () => {
    expect(
      detectFace(
        drawFace(WIDTH, HEIGHT, null, () => 0, CLUTTER),
        3,
      ),
    ).toBeNull();
  });

  it('finds nothing when most of the face is out of the picture', () => {
    const picture = drawFace(WIDTH, HEIGHT, {
      letters: 'URFDLBUFR',
      size: 3,
      x: 330,
      y: 100,
      side: 150,
    });
    expect(detectFace(picture, 3)).toBeNull();
  });
});
