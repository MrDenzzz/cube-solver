import type { CubieCube } from '@cube/core';
import { rankCombination, rankPermutation, unrankCombination, unrankPermutation } from './math.ts';

// Coordinate ranges follow Kociemba's two-phase algorithm (https://kociemba.org/math/twophase.htm,
// defs.py of RubiksCube-TwophaseSolver). The encodings are our own, chosen so that the solved
// cube, and every cube in G1 = <U, D, R2, L2, F2, B2> for the phase-1 coordinates, maps to 0.
export const N_TWIST = 2187; // 3^7 corner orientations
export const N_FLIP = 2048; // 2^11 edge orientations
export const N_SLICE = 495; // C(12,4) positions of the FR, FL, BL, BR edges
export const N_SLICE_SORTED = 11880; // the same with their order: 12·11·10·9
export const N_UD_EDGE_GROUP = 11880; // U edges (or D edges): positions and order
export const N_CORNER_PERM = 40320; // 8!
export const N_UD_EDGE_PERM = 40320; // 8! U and D edges, valid in G1
export const N_SLICE_PERM = 24; // 4! slice edges, valid in G1
/** U-edge values whose four edges all lie in positions 0..7, as in G1. */
export const N_U_EDGES_IN_G1 = 1680; // C(8,4)·4!

const SLICE_EDGE = 8; // FR, FL, BL, BR are edges 8..11
const U_EDGE = 0; // UR, UF, UL, UB are edges 0..3
const D_EDGE = 4; // DR, DF, DL, DB are edges 4..7

export function getTwist(co: ArrayLike<number>): number {
  let twist = 0;
  for (let i = 0; i < 7; i++) twist = 3 * twist + co[i];
  return twist;
}

export function setTwist(twist: number, co: Uint8Array): void {
  let total = 0;
  for (let i = 6; i >= 0; i--) {
    co[i] = twist % 3;
    total += co[i];
    twist = Math.floor(twist / 3);
  }
  co[7] = (3 - (total % 3)) % 3;
}

export function getFlip(eo: ArrayLike<number>): number {
  let flip = 0;
  for (let i = 0; i < 11; i++) flip = 2 * flip + eo[i];
  return flip;
}

export function setFlip(flip: number, eo: Uint8Array): void {
  let total = 0;
  for (let i = 10; i >= 0; i--) {
    eo[i] = flip & 1;
    total += eo[i];
    flip >>= 1;
  }
  eo[11] = total & 1;
}

/**
 * Positions and order of the four edges `first`..`first+3`. Positions are ranked in colex order,
 * mirrored (11 − position) when `mirrored`, so that the group's home positions rank 0; the order
 * is the permutation of the four edges read by increasing position.
 */
const groupPositions = new Uint8Array(4);
const groupOrder = new Uint8Array(4);

function getEdgeGroup(ep: ArrayLike<number>, first: number, mirrored: boolean): number {
  let found = 0;
  for (let p = 0; p < 12; p++) {
    const edge = ep[p];
    if (edge >= first && edge < first + 4) {
      // Mirrored positions are collected in descending order; store them ascending.
      groupPositions[mirrored ? 3 - found : found] = mirrored ? 11 - p : p;
      groupOrder[found++] = edge - first;
    }
  }
  return rankCombination(groupPositions) * 24 + rankPermutation(groupOrder);
}

function setEdgeGroup(value: number, first: number, mirrored: boolean, ep: Uint8Array): void {
  const ranked = new Uint8Array(4);
  unrankCombination(Math.floor(value / 24), 4, ranked);
  const positions = Array.from(ranked, (p) => (mirrored ? 11 - p : p)).sort((a, b) => a - b);
  const order = new Uint8Array(4);
  unrankPermutation(value % 24, 4, order);
  ep.fill(255);
  positions.forEach((p, i) => (ep[p] = first + order[i]));
  let other = 0;
  for (let p = 0; p < 12; p++) {
    if (ep[p] !== 255) continue;
    while (other >= first && other < first + 4) other++;
    ep[p] = other++;
  }
}

export const getSliceSorted = (ep: ArrayLike<number>) => getEdgeGroup(ep, SLICE_EDGE, true);
export const getUEdges = (ep: ArrayLike<number>) => getEdgeGroup(ep, U_EDGE, false);
export const getDEdges = (ep: ArrayLike<number>) => getEdgeGroup(ep, D_EDGE, false);

export function setSliceSorted(value: number, ep: Uint8Array): void {
  setEdgeGroup(value, SLICE_EDGE, true, ep);
}

export function setUEdges(value: number, ep: Uint8Array): void {
  setEdgeGroup(value, U_EDGE, false, ep);
}

export function setDEdges(value: number, ep: Uint8Array): void {
  setEdgeGroup(value, D_EDGE, false, ep);
}

/** Positions of the slice edges only: sliceSorted ÷ 24. */
export const getSlice = (ep: ArrayLike<number>) => Math.floor(getSliceSorted(ep) / 24);

export const getCornerPerm = (cp: ArrayLike<number>) => rankPermutation(cp, 8);
export const setCornerPerm = (v: number, cp: Uint8Array) => {
  unrankPermutation(v, 8, cp);
};

/** Permutation of the U and D edges, which in G1 occupy positions 0..7. */
export const getUDEdgePerm = (ep: ArrayLike<number>) => rankPermutation(ep, 8);
export function setUDEdgePerm(v: number, ep: Uint8Array): void {
  unrankPermutation(v, 8, ep);
  for (let p = 8; p < 12; p++) ep[p] = p;
}

/** Permutation of the slice edges, which in G1 occupy positions 8..11. Equals sliceSorted there. */
export function getSlicePerm(ep: ArrayLike<number>): number {
  return rankPermutation([ep[8] - 8, ep[9] - 8, ep[10] - 8, ep[11] - 8]);
}

export interface Phase1Coordinates {
  readonly twist: number;
  readonly flip: number;
  readonly slice: number;
}

export function phase1Coordinates(cube: CubieCube): Phase1Coordinates {
  return { twist: getTwist(cube.co), flip: getFlip(cube.eo), slice: getSlice(cube.ep) };
}
