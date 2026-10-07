import { slotPermutations } from '@cube/core';
import { choose, unrankCombination } from '../math.ts';
import {
  CENTRE_MOVES,
  MOVES,
  N_MOVES_4,
  PHASE1_MOVES,
  PHASE2_MOVES,
  PHASE3_LOW,
  PHASE3_MOVES,
  WING_PARITY_FLIP,
} from './moves.ts';

// Coordinates and pruning tables of the three reduction phases. Centre slots are numbered face
// by face (U 0–3, R 4–7, F 8–11, D 12–15, L 16–19, B 20–23); a set of slots is a bit mask, ranked
// in colex order so the target sets rank low. Every table is an exact breadth-first distance.

const UNVISITED = 255;
export const R_COLOUR = 1;
export const L_COLOUR = 4;

/** The U, F, D, B centre slots, and the R and L ones, in the order their masks use. */
export const SIDE_SLOTS: readonly number[] = [
  0, 1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23,
];
export const RL_SLOTS: readonly number[] = [4, 5, 6, 7, 16, 17, 18, 19];
export const UD_SLOTS: readonly number[] = [0, 1, 2, 3, 12, 13, 14, 15];
export const FB_SLOTS: readonly number[] = [8, 9, 10, 11, 20, 21, 22, 23];

export function rankMask(mask: number, bits: number): number {
  let rank = 0;
  let found = 0;
  for (let p = 0; p < bits; p++) if ((mask >>> p) & 1) rank += choose(p, ++found);
  return rank;
}

/**
 * rankMask(mask, 24) a byte at a time: a set bit's term depends only on its position and on how
 * many set bits come before it, so each byte's share is a table lookup by the bits below it.
 */
const BYTE_RANK: readonly Uint32Array[] = [0, 1, 2].map((byte) =>
  Uint32Array.from({ length: 25 * 256 }, (_, i) => {
    const below = Math.floor(i / 256);
    let rank = 0;
    let found = below;
    for (let j = 0; j < 8; j++) if (((i % 256) >>> j) & 1) rank += choose(8 * byte + j, ++found);
    return rank;
  }),
);
const POPCOUNT = Uint8Array.from({ length: 256 }, (_, v) => {
  let n = 0;
  for (let x = v; x !== 0; x &= x - 1) n++;
  return n;
});

export function rankMask24(mask: number): number {
  const b0 = mask & 255;
  const b1 = (mask >>> 8) & 255;
  const below2 = POPCOUNT[b0] + POPCOUNT[b1];
  return (
    BYTE_RANK[0][b0] +
    BYTE_RANK[1][POPCOUNT[b0] * 256 + b1] +
    BYTE_RANK[2][below2 * 256 + (mask >>> 16)]
  );
}

export function unrankMask(rank: number, k: number): number {
  const positions = new Uint8Array(k);
  unrankCombination(rank, k, positions);
  let mask = 0;
  for (const p of positions) mask |= 1 << p;
  return mask;
}

/** Where each centre slot's content goes under a move. */
const CENTRE_TARGET = CENTRE_MOVES.map((source) => {
  const target = new Array<number>(24);
  source.forEach((from, to) => (target[from] = to));
  return target;
});

/** Moves a mask over `slots` (a subset closed under the move) to the mask after the move. */
function moveMask(mask: number, slots: readonly number[], m: number): number {
  const target = CENTRE_TARGET[m];
  let out = 0;
  slots.forEach((slot, bit) => {
    if ((mask >>> bit) & 1) out |= 1 << slots.indexOf(target[slot]);
  });
  return out;
}

/** table[c · N + m]: rank after move m of the k-subset of `slots` ranked c. */
function maskMoveTable(slots: readonly number[], k: number, moves: readonly number[]): Uint16Array {
  const size = choose(slots.length, k);
  const table = new Uint16Array(size * N_MOVES_4);
  for (let c = 0; c < size; c++) {
    const mask = unrankMask(c, k);
    for (const m of moves)
      table[c * N_MOVES_4 + m] = rankMask(moveMask(mask, slots, m), slots.length);
  }
  return table;
}

/** Breadth-first distances from `targets` over a space described by its neighbour function. */
function bfs(
  size: number,
  targets: readonly number[],
  moves: readonly number[],
  next: (i: number, m: number) => number,
) {
  const depth = new Uint8Array(size).fill(UNVISITED);
  for (const t of targets) depth[t] = 0;
  let frontier = targets.length;
  for (let level = 0; frontier > 0; level++) {
    frontier = 0;
    for (let i = 0; i < size; i++) {
      if (depth[i] !== level) continue;
      for (const m of moves) {
        const j = next(i, m);
        if (depth[j] === UNVISITED) {
          depth[j] = level + 1;
          frontier++;
        }
      }
    }
  }
  return depth;
}

const ALL_SLOTS: readonly number[] = Array.from({ length: 24 }, (_, i) => i);
const maskOf = (slots: readonly number[], of: readonly number[]) =>
  of.reduce((mask, slot) => mask | (1 << slots.indexOf(slot)), 0);

/** Phase 1: the 8 slots holding R and L centres, C(24, 8) = 735,471 values. */
export const N_PHASE1 = choose(24, 8);
export const PHASE1_TARGET = rankMask(maskOf(ALL_SLOTS, RL_SLOTS), 24);

/** Phase 2: U/D centres among the side slots (12,870), R centres among R/L slots (70), parity. */
export const N_CT = choose(16, 8);
export const N_RL = choose(8, 4);
export const CT_TARGET = rankMask(maskOf(SIDE_SLOTS, UD_SLOTS), 16);
export const RL_SOLVED = rankMask(maskOf(RL_SLOTS, [4, 5, 6, 7]), 8);
export const UD_SOLVED = rankMask(maskOf(UD_SLOTS, [0, 1, 2, 3]), 8);
export const FB_SOLVED = rankMask(maskOf(FB_SLOTS, [8, 9, 10, 11]), 8);

export interface ReductionTables {
  readonly phase1: Uint8Array;
  readonly ctMove: Uint16Array;
  readonly rlMove: Uint16Array;
  /** (ct · 70 + rl) · 2 + parity. */
  readonly phase2: Uint8Array;
  /** R/L arrangements phase 3 can solve: phase 2 must end in one of them. */
  readonly rlTargets: ReadonlySet<number>;
  readonly udMove: Uint16Array;
  readonly fbMove: Uint16Array;
  /** Change of the PLL-parity bit per move. */
  readonly pllFlip: Uint8Array;
  /** ((ud · 70 + fb) · 70 + rl) · 2 + pll. */
  readonly centres3: Uint8Array;
  readonly bytes: number;
}

function parityOf(permutation: readonly number[]): number {
  const seen = new Array<boolean>(permutation.length).fill(false);
  let parity = 0;
  for (let i = 0; i < permutation.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = permutation[j]) {
      seen[j] = true;
      length++;
    }
    parity ^= (length - 1) & 1;
  }
  return parity;
}

export function buildReductionTables(onStep?: (name: string, ms: number) => void): ReductionTables {
  let start = performance.now();
  const step = (name: string) => {
    const now = performance.now();
    onStep?.(name, now - start);
    start = now;
  };

  // Phase 1: masks of the R/L centres are permuted byte by byte through lookup tables.
  const byteTargets = MOVES.map((_, m) =>
    [0, 1, 2].map((b) =>
      Uint32Array.from({ length: 256 }, (_, v) => {
        let out = 0;
        for (let j = 0; j < 8; j++) if ((v >>> j) & 1) out |= 1 << CENTRE_TARGET[m][8 * b + j];
        return out;
      }),
    ),
  );
  const masks = Int32Array.from({ length: N_PHASE1 }, (_, i) => unrankMask(i, 8));
  const phase1 = bfs(N_PHASE1, [PHASE1_TARGET], PHASE1_MOVES, (i, m) => {
    const mask = masks[i];
    const [b0, b1, b2] = byteTargets[m];
    return rankMask24(b0[mask & 255] | b1[(mask >>> 8) & 255] | b2[mask >>> 16]);
  });
  step('phase 1');

  const ctMove = maskMoveTable(SIDE_SLOTS, 8, PHASE2_MOVES);
  const rlMove = maskMoveTable(RL_SLOTS, 4, [...new Set([...PHASE2_MOVES, ...PHASE3_MOVES])]);
  const rlTargets = new Set<number>([RL_SOLVED]);
  for (const rl of rlTargets)
    for (const m of PHASE3_MOVES) rlTargets.add(rlMove[rl * N_MOVES_4 + m]);
  const phase2Targets = [...rlTargets].map((rl) => (CT_TARGET * N_RL + rl) * 2);
  const phase2 = bfs(N_CT * N_RL * 2, phase2Targets, PHASE2_MOVES, (i, m) => {
    const parity = i & 1;
    const rest = i >>> 1;
    const ct = ctMove[Math.floor(rest / N_RL) * N_MOVES_4 + m];
    const rl = rlMove[(rest % N_RL) * N_MOVES_4 + m];
    return (ct * N_RL + rl) * 2 + (parity ^ WING_PARITY_FLIP[m]);
  });
  step('phase 2');

  const udMove = maskMoveTable(UD_SLOTS, 4, PHASE3_MOVES);
  const fbMove = maskMoveTable(FB_SLOTS, 4, PHASE3_MOVES);
  // The PLL-parity bit is the parity of the edges in the low slots against the corners'; a move
  // flips it when the two permutations it makes differ in parity.
  const pllFlip = Uint8Array.from(MOVES, (move, m) => {
    const corners = slotPermutations(move).corners;
    const cornerParity = corners === null ? 0 : parityOf(corners.cp);
    const low = PHASE3_LOW[m];
    return low.includes(-1) ? 0 : parityOf(low) ^ cornerParity;
  });
  const centres3 = bfs(
    N_RL * N_RL * N_RL * 2,
    [((UD_SOLVED * N_RL + FB_SOLVED) * N_RL + RL_SOLVED) * 2],
    PHASE3_MOVES,
    (i, m) => {
      const pll = i & 1;
      let rest = i >>> 1;
      const rl = rest % N_RL;
      rest = Math.floor(rest / N_RL);
      const fb = rest % N_RL;
      const ud = Math.floor(rest / N_RL);
      const ud1 = udMove[ud * N_MOVES_4 + m];
      const fb1 = fbMove[fb * N_MOVES_4 + m];
      const rl1 = rlMove[rl * N_MOVES_4 + m];
      return ((ud1 * N_RL + fb1) * N_RL + rl1) * 2 + (pll ^ pllFlip[m]);
    },
  );
  step('phase 3 centres');

  const tables = [phase1, ctMove, rlMove, phase2, udMove, fbMove, pllFlip, centres3];
  return {
    phase1,
    ctMove,
    rlMove,
    phase2,
    rlTargets,
    udMove,
    fbMove,
    pllFlip,
    centres3,
    bytes: tables.reduce((s, t) => s + t.byteLength, 0),
  };
}
