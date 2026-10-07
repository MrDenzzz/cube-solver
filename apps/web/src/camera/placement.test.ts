import {
  cube4ToFacelets,
  nextBelow,
  randomCube,
  randomCube4,
  toFacelets,
  Xoshiro128StarStar,
  type Rng,
} from '@cube/core';
import { describe, expect, it } from 'vitest';
import { placeFaces, rotateFace } from './placement.ts';

/** The faces as pictures: shuffled, each turned at random, except a first one kept as given. */
function pictures(stickers: string, size: number, rng: Rng, keepFirst: number | null): string[] {
  const perFace = size * size;
  const faces = Array.from({ length: 6 }, (_, f) => stickers.slice(f * perFace, (f + 1) * perFace));
  const rest = [0, 1, 2, 3, 4, 5].filter((f) => f !== keepFirst);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = nextBelow(rng, i + 1);
    [rest[i], rest[j]] = [rest[j] ?? 0, rest[i] ?? 0];
  }
  const order = keepFirst === null ? rest : [keepFirst, ...rest];
  return order.map((f, i) =>
    rotateFace(faces[f] ?? '', size, keepFirst !== null && i === 0 ? 0 : nextBelow(rng, 4)),
  );
}

/** Two stickers of different colours swapped, as a misread by the balanced classifier looks. */
function misread(stickers: string, rng: Rng): string {
  const out = stickers.split('');
  const i = nextBelow(rng, out.length);
  let j = nextBelow(rng, out.length);
  while (out[j] === out[i]) j = nextBelow(rng, out.length);
  [out[i], out[j]] = [out[j] ?? '', out[i] ?? ''];
  return out.join('');
}

describe('placing face pictures', () => {
  it('turns a picture a quarter clockwise', () => {
    expect(rotateFace('abcdefghi', 3, 1)).toBe('gdahebifc');
    expect(rotateFace('abcdefghi', 3, 4)).toBe('abcdefghi');
  });

  it('puts 3×3×3 pictures in any order and rotation back by their centres', () => {
    const rng = Xoshiro128StarStar.fromSeed(31);
    for (let i = 0; i < 50; i++) {
      const stickers = toFacelets(randomCube(rng));
      expect(placeFaces(pictures(stickers, 3, rng, null), 3)).toEqual({
        stickers,
        broken: 0,
        ambiguous: false,
      });
    }
  });

  it('puts 4×4×4 pictures back around the first one, which becomes the front', () => {
    const rng = Xoshiro128StarStar.fromSeed(32);
    for (let i = 0; i < 50; i++) {
      const stickers = cube4ToFacelets(randomCube4(rng));
      const placed = placeFaces(pictures(stickers, 4, rng, 2), 4);
      expect(placed?.stickers).toBe(stickers);
      expect(placed?.broken).toBe(0);
    }
  });

  it('still finds where the pictures go with a misread sticker', () => {
    const rng = Xoshiro128StarStar.fromSeed(33);
    let right = 0;
    for (let i = 0; i < 40; i++) {
      const stickers = misread(cube4ToFacelets(randomCube4(rng)), rng);
      const placed = placeFaces(pictures(stickers, 4, rng, 2), 4);
      if (placed?.stickers === stickers) right++;
    }
    // A swap can make another arrangement fit as well, rarely; on these cubes it never does.
    expect(right).toBe(40);
  });

  it('gives up on 3×3×3 pictures without six different centres', () => {
    const stickers = toFacelets(randomCube(Xoshiro128StarStar.fromSeed(34)));
    const faces = pictures(stickers, 3, Xoshiro128StarStar.fromSeed(35), null);
    const twice = [faces[0] ?? '', ...faces.slice(0, 5)];
    expect(placeFaces(twice, 3)).toBeNull();
  });
});
