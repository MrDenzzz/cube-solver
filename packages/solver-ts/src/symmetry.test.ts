import {
  applyFaceTurn,
  equals,
  FACE_TURNS,
  FACES,
  parseFacelets,
  randomCube,
  toFacelets,
  Xoshiro128StarStar,
  type CubieCube,
} from '@cube/core';
import { describe, expect, it } from 'vitest';
import { getTwist } from './coordinates.ts';
import {
  buildFlipSliceClasses,
  N_FLIPSLICE_CLASS,
  N_FLIPSLICESORTED_CLASS,
} from './sym-coordinates.ts';
import {
  buildTwistConjugation,
  conjugateEdges,
  conjugateFaces,
  D4H,
  INVERSE_SYM,
  N_SYM,
} from './symmetry.ts';

/** Conjugation through stickers and the full validating parser: the slow reference. */
function conjugate(cube: CubieCube, s: number): CubieCube {
  const faces = Uint8Array.from(toFacelets(cube), (letter) => FACES.indexOf(letter as 'U'));
  const out = new Uint8Array(54);
  conjugateFaces(faces, s, out);
  const parsed = parseFacelets(Array.from(out, (f) => FACES[f]).join(''));
  if (!parsed.ok)
    throw new Error(`Conjugate by ${String(s)} is not a cube: ${parsed.errors[0]?.code}`);
  return parsed.value;
}

const rng = Xoshiro128StarStar.fromSeed(7n);
const cubes = Array.from({ length: 40 }, () => randomCube(rng));

describe('D4h symmetries', () => {
  it('has 16 elements, half of them mirror images, with the identity first', () => {
    expect(D4H).toHaveLength(N_SYM);
    expect(D4H.filter((s) => s.mirror)).toHaveLength(8);
    expect(Array.from(D4H[0].stickerTo)).toEqual(Array.from({ length: 54 }, (_, i) => i));
    expect(D4H.every((sym) => sym.faceTo[0] === 0 || sym.faceTo[0] === 3)).toBe(true);
  });

  it('pairs every symmetry with its inverse', () => {
    for (const cube of cubes.slice(0, 5)) {
      for (let s = 0; s < N_SYM; s++) {
        expect(equals(conjugate(conjugate(cube, s), INVERSE_SYM[s]), cube)).toBe(true);
      }
    }
  });

  it('maps valid states to valid states and moves to moves, mirror images included', () => {
    for (let s = 0; s < N_SYM; s++) {
      for (const cube of cubes.slice(0, 5)) {
        for (const turn of FACE_TURNS) {
          // conj(X · m) = conj(X) · conj(m), and conj(m) is again a face turn.
          const moved = conjugate(applyFaceTurn(cube, turn), s);
          const image = FACE_TURNS.find((t) => equals(applyFaceTurn(conjugate(cube, s), t), moved));
          expect(image).toBeDefined();
        }
      }
    }
  });

  it('conjugates edges at cubie level exactly as through the stickers', () => {
    const ep = new Uint8Array(12);
    const eo = new Uint8Array(12);
    for (const cube of cubes) {
      for (let s = 0; s < N_SYM; s++) {
        conjugateEdges(s, cube.ep, cube.eo, ep, eo);
        const reference = conjugate(cube, s);
        expect(Array.from(ep)).toEqual(reference.ep);
        expect(Array.from(eo)).toEqual(reference.eo);
      }
    }
  });

  it('conjugates the twist exactly as through the stickers', () => {
    const table = buildTwistConjugation();
    for (const cube of cubes) {
      for (let s = 0; s < N_SYM; s++) {
        expect(table[getTwist(cube.co) * N_SYM + s]).toBe(getTwist(conjugate(cube, s).co));
      }
    }
  });
});

describe('flip-slice symmetry classes', () => {
  it(`finds Kociemba's ${String(N_FLIPSLICE_CLASS)} FlipUDSlice classes`, () => {
    const classes = buildFlipSliceClasses(false);
    expect(classes.count).toBe(N_FLIPSLICE_CLASS);
    // Every value maps to its class representative under its recorded symmetry.
    expect(classes.classOf.every((packed) => packed >>> 4 < N_FLIPSLICE_CLASS)).toBe(true);
    expect(classes.stabilizer.every((mask) => (mask & 1) === 1)).toBe(true);
  });

  it(
    `finds Kociemba's ${String(N_FLIPSLICESORTED_CLASS)} FlipUDSliceSorted classes`,
    { timeout: 120_000 },
    () => {
      expect(buildFlipSliceClasses(true).count).toBe(N_FLIPSLICESORTED_CLASS);
    },
  );
});
