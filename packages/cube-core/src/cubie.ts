import { faceletOfCubie, facesOf, type Face } from './geometry.ts';
import { at } from './util.ts';

// Piece names and their order follow Kociemba (https://kociemba.org/math/cubielevel.htm), so the
// coordinates built on top of them match the published table sizes and symmetry classes. A name
// also lists the piece's stickers in reference order: the U/D sticker first (F/B for the middle
// layer edges), then clockwise around the corner.
export const CORNERS = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'] as const;
// prettier-ignore
export const EDGES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'] as const;

export type CornerName = (typeof CORNERS)[number];
export type EdgeName = (typeof EDGES)[number];

/** Sticker faces of each corner, in reference order. */
export const CORNER_FACES: readonly (readonly Face[])[] = CORNERS.map(facesOf);

/** Sticker faces of each edge, in reference order. */
export const EDGE_FACES: readonly (readonly Face[])[] = EDGES.map(facesOf);

/** Facelet indices of each corner position, in the corner's reference sticker order. */
export const CORNER_FACELETS: readonly (readonly number[])[] = CORNER_FACES.map((faces) =>
  faces.map((face) => faceletOfCubie(3, face, faces)),
);

/** Facelet indices of each edge position, in the edge's reference sticker order. */
export const EDGE_FACELETS: readonly (readonly number[])[] = EDGE_FACES.map((faces) =>
  faces.map((face) => faceletOfCubie(3, face, faces)),
);

/**
 * A 3×3×3 state relative to the centres. Uses the "is replaced by" convention: cp[i] is the
 * corner that sits at position i, and co[i] how far it is twisted clockwise (0..2) relative to
 * its reference orientation; ep and eo likewise for edges (flip 0..1).
 */
export interface CubieCube {
  readonly cp: readonly number[];
  readonly co: readonly number[];
  readonly ep: readonly number[];
  readonly eo: readonly number[];
}

export const SOLVED: CubieCube = {
  cp: [0, 1, 2, 3, 4, 5, 6, 7],
  co: [0, 0, 0, 0, 0, 0, 0, 0],
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** The state reached by applying `a` and then `b`. */
export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  return {
    cp: b.cp.map((from) => at(a.cp, from)),
    co: b.cp.map((from, i) => (at(a.co, from) + at(b.co, i)) % 3),
    ep: b.ep.map((from) => at(a.ep, from)),
    eo: b.ep.map((from, i) => (at(a.eo, from) + at(b.eo, i)) % 2),
  };
}

export function inverse(cube: CubieCube): CubieCube {
  const cp = new Array<number>(8);
  const co = new Array<number>(8);
  cube.cp.forEach((corner, position) => {
    cp[corner] = position;
    co[corner] = (3 - at(cube.co, position)) % 3;
  });
  const ep = new Array<number>(12);
  const eo = new Array<number>(12);
  cube.ep.forEach((edge, position) => {
    ep[edge] = position;
    eo[edge] = at(cube.eo, position);
  });
  return { cp, co, ep, eo };
}

export function equals(a: CubieCube, b: CubieCube): boolean {
  const same = (x: readonly number[], y: readonly number[]) => x.every((v, i) => v === y[i]);
  return same(a.cp, b.cp) && same(a.co, b.co) && same(a.ep, b.ep) && same(a.eo, b.eo);
}

export function isSolved(cube: CubieCube): boolean {
  return equals(cube, SOLVED);
}
