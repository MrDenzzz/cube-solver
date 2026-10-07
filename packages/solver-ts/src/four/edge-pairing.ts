import { EDGE_FACES, faceletAt, stickerAt, WING_FACELETS, type Vec3 } from '@cube/core';
import { LOW_SLOT, N_MOVES_4, PHASE3_HIGH, PHASE3_LOW, PHASE3_MOVES, WING_CLASS } from './moves.ts';

// Phase 3's edge coordinate, after the Edge3 table of Chen Shuang's TPR. Phase 3's moves keep each
// edge's two wings in one low and one high slot, so the edges are one permutation σ: for each
// position, the position whose high slot holds the partner of the wing in its low slot. They are
// paired when σ is the identity. A move with permutations L and H of the low and high slots sends
// σ to H·σ·L⁻¹, which keeps σ even: 12!/2 = 239,500,800 states.
//
// The cube's symmetries that keep every slot's class keep the distances too. They keep the R–L
// axis, so they turn each phase 3 move into one, or into Dw2, Lw2 or Bw2, which are Uw2, Rw2 and
// Fw2 followed by a turn of the whole cube; such a turn leaves paired edges paired, and pushed to
// the end of a sequence it turns the moves after it into phase 3 moves or those three again. They
// also keep the four M-slice positions among themselves, so the first four entries of σ, with
// those positions first, have a symmetry class of their own; the coordinate is that class times
// the rank of the next six entries (the last two follow from the parity). Distances are stored
// mod 3 up to 9, the rest as 3, read as "10 or more", as TPR does: the bound is weaker there, but
// the table fills in a second.

/** Coordinate order of the edge positions: the M slice (no R or L facelet) first. */
const ORDER: readonly number[] = (() => {
  const all = EDGE_FACES.map((_, e) => e);
  const inSlice = (e: number) => !EDGE_FACES[e].some((f) => f === 'R' || f === 'L');
  return [...all.filter(inSlice), ...all.filter((e) => !inSlice(e))];
})();
const COORD: readonly number[] = invert(ORDER);

function invert(p: readonly number[]): number[] {
  const out = new Array<number>(p.length);
  p.forEach((x, i) => (out[x] = i));
  return out;
}

const N_PREFIX = 12 * 11 * 10 * 9;
const N_SUFFIX = 8 * 7 * 6 * 5 * 4 * 3;
export const MAX_EDGE_DISTANCE = 10;
const N_SYMS = 8;

/** Number of set bits below each 12-bit mask, for ranking. */
const POP = Uint8Array.from({ length: 4096 }, (_, v) => {
  let n = 0;
  for (let x = v; x !== 0; x &= x - 1) n++;
  return n;
});

/** The symmetries as maps of coordinate positions (where each goes); the identity first. */
const SYMS: readonly (readonly number[])[] = (() => {
  const syms: number[][] = [];
  const axes = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  for (const axis of axes) {
    for (let signs = 0; signs < 8; signs++) {
      const map = (v: Vec3): Vec3 => {
        const out: [number, number, number] = [0, 0, 0];
        for (let i = 0; i < 3; i++) out[axis[i]] = v[i] * ((signs >> i) & 1 ? -1 : 1);
        return out;
      };
      const target = WING_FACELETS.map(([facelet]) => {
        const { position, normal } = stickerAt(4, facelet);
        const image = faceletAt(4, { position: map(position), normal: map(normal) });
        return WING_FACELETS.findIndex(([a, b]) => a === image || b === image);
      });
      if (target.some((t, slot) => WING_CLASS[t] !== WING_CLASS[slot])) continue;
      syms.push(ORDER.map((p) => COORD[target[LOW_SLOT[p]] >> 1]));
    }
  }
  if (syms.length !== N_SYMS || syms.some((a) => a.slice(0, 4).some((q) => q >= 4))) {
    throw new Error('Unexpected symmetries of the edge pairing');
  }
  return syms;
})();

/**
 * For each move m and symmetry s, the move followed by the symmetry as σ'[q] = VAL[σ[SRC[q]]]:
 * entries at 12 · (m · 8 + s). Symmetry s alone is under move N_MOVES_4.
 */
const SRC = new Uint8Array((N_MOVES_4 + 1) * N_SYMS * 12);
const VAL = new Uint8Array((N_MOVES_4 + 1) * N_SYMS * 12);
{
  const identity = Array.from({ length: 12 }, (_, i) => i);
  const fill = (m: number, lowSource: readonly number[], highTarget: readonly number[]) => {
    SYMS.forEach((a, s) => {
      const ainv = invert(a);
      const at = (m * N_SYMS + s) * 12;
      for (let q = 0; q < 12; q++) {
        SRC[at + q] = lowSource[ainv[q]];
        VAL[at + q] = a[highTarget[q]];
      }
    });
  };
  for (const m of PHASE3_MOVES) {
    const low = ORDER.map((p) => COORD[PHASE3_LOW[m]?.[p]]);
    const highSource = ORDER.map((p) => COORD[PHASE3_HIGH[m]?.[p]]);
    fill(m, low, invert(highSource));
  }
  fill(N_MOVES_4, identity, identity);
}

/** Rank of σ's first four entries after move-and-symmetry `ms`, in radix 12, 11, 10, 9. */
function rankPrefix(state: Uint8Array, from: number, ms: number): number {
  let used = 0;
  let rank = 0;
  for (let i = 0; i < 4; i++) {
    const v = VAL[ms + state[from + SRC[ms + i]]];
    rank = rank * (12 - i) + v - POP[used & ((1 << v) - 1)];
    used |= 1 << v;
  }
  return rank;
}

/** Rank of entries 4 to 9 after move-and-symmetry `ms`, among the values left. */
function rankSuffix(state: Uint8Array, from: number, ms: number): number {
  let used = 0;
  let rank = 0;
  for (let i = 0; i < 10; i++) {
    const v = VAL[ms + state[from + SRC[ms + i]]];
    if (i >= 4) rank = rank * (12 - i) + v - POP[used & ((1 << v) - 1)];
    used |= 1 << v;
  }
  return rank;
}

export interface EdgePairingTable {
  /** Prefix rank → class · 8 + the symmetry that takes it to the class representative. */
  readonly rawToSym: Uint16Array;
  readonly symToRaw: Uint16Array;
  /** Symmetries that fix each representative, as a bit mask. */
  readonly stabiliser: Uint8Array;
  /** Distance mod 3, 3 for 10 or more; 2 bits per state, 16 per word. */
  readonly prune: Uint32Array;
}

function buildSymmetryClasses() {
  const rawToSym = new Uint16Array(N_PREFIX).fill(0xffff);
  const representatives: number[] = [];
  const stabilisers: number[] = [];
  const state = new Uint8Array(12);
  for (let raw = 0; raw < N_PREFIX; raw++) {
    if (rawToSym[raw] !== 0xffff) continue;
    unrankPrefix(raw, state);
    const cls = representatives.length;
    let stabiliser = 0;
    for (let s = 0; s < N_SYMS; s++) {
      const image = rankPrefix(state, 0, (N_MOVES_4 * N_SYMS + s) * 12);
      if (image === raw) stabiliser |= 1 << s;
      // The symmetry that takes the image back to the representative is the inverse of s.
      rawToSym[image] = (cls << 3) | inverseSym(s);
    }
    representatives.push(raw);
    stabilisers.push(stabiliser);
  }
  return {
    rawToSym,
    symToRaw: Uint16Array.from(representatives),
    stabiliser: Uint8Array.from(stabilisers),
  };
}

const INVERSE_SYM: readonly number[] = SYMS.map((a) => {
  const ainv = invert(a).join();
  return SYMS.findIndex((b) => b.join() === ainv);
});
const inverseSym = (s: number) => INVERSE_SYM[s];

/** The first four entries from a prefix rank, the rest in increasing order. */
function unrankPrefix(raw: number, out: Uint8Array): void {
  const digits = [0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) {
    digits[i] = raw % (12 - i);
    raw = Math.floor(raw / (12 - i));
  }
  let free = 0xfff;
  digits.forEach((d, i) => {
    out[i] = nthFree(free, d);
    free &= ~(1 << out[i]);
  });
  for (let i = 4; i < 12; i++) {
    out[i] = nthFree(free, 0);
    free &= ~(1 << out[i]);
  }
}

function nthFree(free: number, n: number): number {
  let v = 0;
  for (let left = n; ; v++) {
    if (((free >>> v) & 1) === 0) continue;
    if (left === 0) return v;
    left--;
  }
}

export const N_EDGE_STATES_PER_CLASS = N_SUFFIX;

/** σ from its coordinate: class representative's prefix, the suffix rank, and even parity. */
function unrankState(table: EdgePairingTable, index: number, out: Uint8Array): void {
  let rest = index % N_SUFFIX;
  const prefix = table.symToRaw[Math.floor(index / N_SUFFIX)];
  unrankPrefix(prefix, out);
  const digits = [0, 0, 0, 0, 0, 0];
  for (let i = 9; i >= 4; i--) {
    digits[i - 4] = rest % (12 - i);
    rest = Math.floor(rest / (12 - i));
  }
  let free = 0xfff;
  for (let i = 0; i < 4; i++) free &= ~(1 << out[i]);
  digits.forEach((d, k) => {
    out[4 + k] = nthFree(free, d);
    free &= ~(1 << out[4 + k]);
  });
  out[10] = nthFree(free, 0);
  out[11] = nthFree(free, 1);
  if (oddPermutation(out)) [out[10], out[11]] = [out[11], out[10]];
}

function oddPermutation(p: Uint8Array): boolean {
  let odd = false;
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (p[i] > p[j]) odd = !odd;
  return odd;
}

const stored = (prune: Uint32Array, i: number) => (prune[i >>> 4] >>> ((i & 15) << 1)) & 3;

/** The coordinate of σ after move m (N_MOVES_4 for none), from `state` at `from`. */
export function edgeIndex(
  table: EdgePairingTable,
  state: Uint8Array,
  from: number,
  m: number,
): number {
  const raw = table.rawToSym[rankPrefix(state, from, m * N_SYMS * 12)];
  return (raw >>> 3) * N_SUFFIX + rankSuffix(state, from, (m * N_SYMS + (raw & 7)) * 12);
}

/** Applies move m to σ at `from`, writing the result at `to`. */
export function moveEdges(state: Uint8Array, from: number, to: number, m: number): void {
  const ms = m * N_SYMS * 12;
  for (let q = 0; q < 12; q++) state[to + q] = VAL[ms + state[from + SRC[ms + q]]];
}

/**
 * Distance of a state next to one at distance `parent`: exact up to 9, and MAX_EDGE_DISTANCE
 * for 10 or more. Neighbours differ by at most one, which the value mod 3 resolves.
 */
export function nextEdgeDistance(table: EdgePairingTable, index: number, parent: number): number {
  const value = stored(table.prune, index);
  return value === 3 ? MAX_EDGE_DISTANCE : ((value - parent + 16) % 3) + parent - 1;
}

/** Exact distance of σ, or MAX_EDGE_DISTANCE for 10 or more, by walking down the table. */
export function edgeDistance(table: EdgePairingTable, sigma: Uint8Array): number {
  const state = new Uint8Array(24);
  state.set(sigma.subarray(0, 12));
  let index = edgeIndex(table, state, 0, N_MOVES_4);
  if (stored(table.prune, index) === 3) return MAX_EDGE_DISTANCE;
  let distance = 0;
  while (index !== 0) {
    const closer = (stored(table.prune, index) + 2) % 3;
    const m = PHASE3_MOVES.find(
      (move) => stored(table.prune, edgeIndex(table, state, 0, move)) === closer,
    );
    if (m === undefined) throw new Error('The edge pairing table is inconsistent');
    moveEdges(state, 0, 12, m);
    state.copyWithin(0, 12, 24);
    index = edgeIndex(table, state, 0, N_MOVES_4);
    distance++;
  }
  return distance;
}

/**
 * σ in coordinate order from the edge positions of each edge's low and high wing (edge position
 * order, as phase 3's caller finds them).
 */
export function edgeState(low: readonly number[], high: readonly number[]): Uint8Array {
  const sigma = new Uint8Array(12);
  low.forEach((p, e) => (sigma[COORD[p]] = COORD[high[e]]));
  return sigma;
}

/** Breadth-first from the paired state, by levels, storing distances up to 9 mod 3. */
export function buildEdgePairing(): EdgePairingTable {
  const classes = buildSymmetryClasses();
  const size = classes.symToRaw.length * N_SUFFIX;
  const prune = new Uint32Array(Math.ceil(size / 16)).fill(0xffffffff);
  const table = { ...classes, prune };
  const set = (i: number, v: number) => {
    prune[i >>> 4] = (prune[i >>> 4] & ~(3 << ((i & 15) << 1))) | (v << ((i & 15) << 1));
  };
  set(0, 0);
  const state = new Uint8Array(24);
  for (let depth = 0; depth < MAX_EDGE_DISTANCE - 1; depth++) {
    const current = depth % 3;
    const next = (depth + 1) % 3;
    for (let word = 0; word < prune.length; word++) {
      if (prune[word] === 0xffffffff) continue;
      for (let i = word << 4, end = i + 16; i < end; i++) {
        if (stored(prune, i) !== current) continue;
        unrankState(table, i, state);
        for (const m of PHASE3_MOVES) {
          const raw = classes.rawToSym[rankPrefix(state, 0, m * N_SYMS * 12)];
          const cls = raw >>> 3;
          const ms = (m * N_SYMS + (raw & 7)) * 12;
          const j = cls * N_SUFFIX + rankSuffix(state, 0, ms);
          if (stored(prune, j) !== 3) continue;
          set(j, next);
          // A representative fixed by other symmetries stands for one state under several
          // suffixes: mark them all.
          const stabiliser = classes.stabiliser[cls];
          if (stabiliser === 1) continue;
          for (let q = 0; q < 12; q++) state[12 + q] = VAL[ms + state[SRC[ms + q]]];
          for (let s = 1; s < N_SYMS; s++) {
            if (((stabiliser >> s) & 1) === 0) continue;
            const k = cls * N_SUFFIX + rankSuffix(state, 12, (N_MOVES_4 * N_SYMS + s) * 12);
            if (stored(prune, k) === 3) set(k, next);
          }
        }
      }
    }
  }
  return table;
}
