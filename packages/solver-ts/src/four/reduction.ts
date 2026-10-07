import {
  applyLayerTurns4,
  cube4ToFacelets,
  isSolved4,
  parseFacelets,
  parseFacelets4,
  rotateFace,
  simplifyLayerTurns,
  slotPermutations,
  wingFlipped,
  type Cube4,
  type CubieCube,
  type Face,
  type LayerTurn,
} from '@cube/core';
import type { TwoPhaseSolve } from '../two-phase.ts';
import {
  edgeDistance,
  edgeIndex,
  edgeState,
  moveEdges,
  nextEdgeDistance,
  type EdgePairingTable,
} from './edge-pairing.ts';
import {
  canFollow,
  CENTRE_MOVES,
  HIGH_SLOT,
  LOW_SLOT,
  MOVES,
  N_MOVES_4,
  PHASE1_MOVES,
  PHASE2_MOVES,
  PHASE3_MOVES,
  WING_MOVES,
  WING_PARITY_FLIP,
} from './moves.ts';
import {
  FB_SLOTS,
  L_COLOUR,
  N_RL,
  R_COLOUR,
  rankMask,
  rankMask24,
  RL_SLOTS,
  SIDE_SLOTS,
  UD_SLOTS,
  type ReductionTables,
} from './tables.ts';

// The 4×4×4 reduction after Chen Shuang's three-phase reduction (TPR), itself after Tsai's
// method: (1) the centres of one colour pair onto one axis; (2) the other centres onto their axes,
// even wing parity, and the wings arranged so that phase 3's moves can pair them; (3) centres
// solved, edges paired, PLL parity fixed. The result is a 3×3×3 for the two-phase solver. Every
// phase is IDA* over exact tables, and several solutions of each phase go on to the next.

export interface ReductionOptions {
  /** Phase 1 solutions kept for phase 2, best first. */
  readonly phase1Candidates?: number;
  /** Phase 2 solutions with wings ready for phase 3. */
  readonly phase2Candidates?: number;
  /** Reduced cubes finished as a 3×3×3; the shortest whole solution wins. */
  readonly phase3Candidates?: number;
  /** Time for each 3×3×3 finish, which stops early at 18 moves. */
  readonly finishTimeMs?: number;
  readonly shouldStop?: () => boolean;
}

export interface ReductionResult {
  /** Undefined when cancelled. */
  readonly moves: readonly LayerTurn[] | undefined;
  /** Moves of the three phases and of the 3×3×3 solve. */
  readonly phases: readonly number[];
}

/** Colour maps that bring each colour pair onto R and L: none, U/D (like z), F/B (like y). */
const RECOLOURINGS: readonly ((face: Face) => Face)[] = [
  (face) => face,
  (face) => rotateFace(face, 'F', 1),
  (face) => rotateFace(face, 'U', 1),
];

/**
 * The same cube with colours renamed by a whole-cube rotation: a valid state, and any sequence
 * that solves it solves the original, since moves do not look at colours.
 */
function recolour(cube: Cube4, map: (face: Face) => Face): Cube4 {
  const stickers = cube4ToFacelets(cube)
    .split('')
    .map((c) => map(c as Face))
    .join('');
  const parsed = parseFacelets4(stickers);
  if (!parsed.ok) throw new Error('Recolouring by a rotation produced an invalid cube');
  return parsed.value;
}

function maskOf(
  slots: readonly number[],
  centres: ArrayLike<number>,
  match: (c: number) => boolean,
) {
  let mask = 0;
  slots.forEach((slot, bit) => {
    if (match(centres[slot])) mask |= 1 << bit;
  });
  return mask;
}

function parity(values: ArrayLike<number>): number {
  const seen = new Array<boolean>(values.length).fill(false);
  let p = 0;
  for (let i = 0; i < values.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = values[j]) {
      seen[j] = true;
      length++;
    }
    p ^= (length - 1) & 1;
  }
  return p;
}

const ALL_SLOTS = Array.from({ length: 24 }, (_, i) => i);

/** Edge positions of each edge's low wing and high wing, if every edge has one of each. */
function edgePositions(wp: ArrayLike<number>): { low: number[]; high: number[] } | null {
  const low = new Array<number>(12).fill(-1);
  const high = new Array<number>(12).fill(-1);
  for (let p = 0; p < 12; p++) {
    const a = wp[LOW_SLOT[p]] >> 1;
    const b = wp[HIGH_SLOT[p]] >> 1;
    if (low[a] !== -1 || high[b] !== -1) return null;
    low[a] = p;
    high[b] = p;
  }
  return { low, high };
}

/**
 * Whether phase 3 can pair the edges. Its moves never move a wing between low and high slots and
 * keep the parity of the low-to-high matching, so: one wing of every edge in a low slot, an even
 * matching, and an even number of flipped edges in the reduced cube.
 */
function wingsReady(wp: ArrayLike<number>): boolean {
  const positions = edgePositions(wp);
  if (positions === null) return false;
  const matching = new Array<number>(12);
  positions.low.forEach((p, e) => (matching[p] = positions.high[e]));
  if (parity(matching) !== 0) return false;
  let flips = 0;
  for (const slot of LOW_SLOT) if (wingFlipped(wp[slot], slot)) flips++;
  return flips % 2 === 0;
}

/**
 * The slots after `length` moves of `moves` from `start`: `perms[m][i]` is the slot whose content
 * a move brings to slot i. Leaves of phase 1 and 2 test only centres or wings, so they replay only
 * those, into two buffers that take turns.
 */
function replaySlots(
  start: ArrayLike<number>,
  perms: readonly (readonly number[])[],
  moves: Uint8Array,
  length: number,
  buffers: readonly [Uint8Array, Uint8Array],
): Uint8Array {
  let [from, to] = buffers;
  from.set(start);
  for (let k = 0; k < length; k++) {
    const perm = perms[moves[k]];
    for (let i = 0; i < 24; i++) to[i] = from[perm[i]];
    [from, to] = [to, from];
  }
  return from;
}

/** A reduced cube as a 3×3×3: corners, one wing per edge, one centre per face. */
function as3x3(reduced: Cube4): CubieCube {
  const stickers = cube4ToFacelets(reduced);
  const lines = [0, 1, 3];
  const facelets = Array.from({ length: 54 }, (_, i) => {
    const face = Math.floor(i / 9);
    return stickers.charAt(face * 16 + lines[Math.floor((i % 9) / 3)] * 4 + lines[i % 3]);
  }).join('');
  const parsed = parseFacelets(facelets);
  if (!parsed.ok) throw new Error(`The reduced cube is no 3×3×3: ${parsed.errors[0]?.code ?? ''}`);
  return parsed.value;
}

interface Candidate {
  readonly cube: Cube4;
  readonly moves: readonly number[];
  readonly lengths: readonly number[];
  /** Lower bound on the total length through the next phase. */
  readonly bound: number;
}

export type ReductionSolve = (cube: Cube4, options?: ReductionOptions) => ReductionResult;

export function createReductionSolver(
  tables: ReductionTables,
  edgeTable: EdgePairingTable,
  solve3: TwoPhaseSolve,
): ReductionSolve {
  const { phase1, ctMove, rlMove, phase2, udMove, fbMove, pllFlip, centres3 } = tables;

  const byteTarget = MOVES.map((move) => {
    const target = new Array<number>(24);
    slotPermutations(move).centres.forEach((from, to) => (target[from] = to));
    return [0, 1, 2].map((b) =>
      Uint32Array.from({ length: 256 }, (_, v) => {
        let out = 0;
        for (let j = 0; j < 8; j++) if ((v >>> j) & 1) out |= 1 << target[8 * b + j];
        return out;
      }),
    );
  });
  const movePhase1 = (mask: number, m: number) => {
    const [b0, b1, b2] = byteTarget[m];
    return b0[mask & 255] | b1[(mask >>> 8) & 255] | b2[mask >>> 16];
  };
  const phase2Index = (centres: ArrayLike<number>, wingParity: number) => {
    const ct = rankMask(
      maskOf(SIDE_SLOTS, centres, (c) => c === 0 || c === 3),
      16,
    );
    const rl = rankMask(
      maskOf(RL_SLOTS, centres, (c) => c === R_COLOUR),
      8,
    );
    return (ct * N_RL + rl) * 2 + wingParity;
  };
  const movePhase2 = (index: number, m: number) => {
    const rest = index >>> 1;
    const ct = ctMove[Math.floor(rest / N_RL) * N_MOVES_4 + m];
    const rl = rlMove[(rest % N_RL) * N_MOVES_4 + m];
    return (ct * N_RL + rl) * 2 + ((index & 1) ^ WING_PARITY_FLIP[m]);
  };
  const moveCentres = (index: number, m: number) => {
    let rest = index >>> 1;
    const rl = rest % N_RL;
    rest = Math.floor(rest / N_RL);
    const fb = rest % N_RL;
    const ud = Math.floor(rest / N_RL);
    const moved =
      (udMove[ud * N_MOVES_4 + m] * N_RL + fbMove[fb * N_MOVES_4 + m]) * N_RL +
      rlMove[rl * N_MOVES_4 + m];
    return moved * 2 + ((index & 1) ^ pllFlip[m]);
  };

  return function solve(input: Cube4, options: ReductionOptions = {}): ReductionResult {
    const keep1 = options.phase1Candidates ?? 200;
    const keep2 = options.phase2Candidates ?? 100;
    const keep3 = options.phase3Candidates ?? 4;
    const finishTimeMs = options.finishTimeMs ?? 50;
    let cancelled = false;
    const stopped = () => {
      if (!cancelled && options.shouldStop?.() === true) cancelled = true;
      return cancelled;
    };
    const path = new Uint8Array(32);
    const buffers = [new Uint8Array(24), new Uint8Array(24)] as const;
    const replay = (cube: Cube4, moves: ArrayLike<number>) =>
      applyLayerTurns4(
        cube,
        Array.from(moves, (m) => MOVES[m]),
      );

    // Phase 1, for each colour pair: every solution up to one move longer than the shortest.
    const firsts: { start: Cube4; moves: number[]; bound: number }[] = [];
    for (const map of RECOLOURINGS) {
      const cube = recolour(input, map);
      const start = maskOf(ALL_SLOTS, cube.centres, (c) => c === R_COLOUR || c === L_COLOUR);
      const shortest = phase1[rankMask24(start)];
      const wingParity = parity(cube.wp);
      const search = (mask: number, togo: number, depth: number, last: number) => {
        if (togo === 0) {
          const centres = replaySlots(cube.centres, CENTRE_MOVES, path, depth, buffers);
          let p = wingParity;
          for (let k = 0; k < depth; k++) p ^= WING_PARITY_FLIP[path[k]];
          const bound = depth + phase2[phase2Index(centres, p)];
          firsts.push({ start: cube, moves: Array.from(path.subarray(0, depth)), bound });
          return;
        }
        for (const m of PHASE1_MOVES) {
          if (!canFollow(last, m)) continue;
          const next = movePhase1(mask, m);
          if (phase1[rankMask24(next)] >= togo) continue;
          path[depth] = m;
          search(next, togo - 1, depth + 1, m);
        }
      };
      for (let length = shortest; length <= shortest + 1; length++) search(start, length, 0, -1);
    }
    firsts.sort((a, b) => a.bound - b.bound);
    const phase1Kept: Candidate[] = firsts.slice(0, keep1).map(({ start, moves, bound }) => ({
      cube: replay(start, moves),
      moves,
      lengths: [moves.length],
      bound,
    }));

    // Phase 2, shortest total first. Solutions are many and most leave the wings unready, so the
    // search goes on until enough pass.
    const seconds: Candidate[] = [];
    const lowest2 = phase1Kept[0]?.bound ?? 0;
    for (let total = lowest2; seconds.length < keep2 && total <= lowest2 + 8; total++) {
      for (const first of phase1Kept) {
        if (first.bound > total || seconds.length >= keep2 || stopped()) break;
        const length = total - first.moves.length;
        const search = (index: number, togo: number, depth: number, last: number): void => {
          if (seconds.length >= keep2) return;
          if (togo === 0) {
            if (!wingsReady(replaySlots(first.cube.wp, WING_MOVES, path, depth, buffers))) return;
            const after = replay(first.cube, path.subarray(0, depth));
            const moves = Array.from(path.subarray(0, depth));
            seconds.push({
              cube: after,
              moves: [...first.moves, ...moves],
              lengths: [...first.lengths, depth],
              bound: 0,
            });
            return;
          }
          for (const m of PHASE2_MOVES) {
            if (!canFollow(last, m)) continue;
            const next = movePhase2(index, m);
            if (phase2[next] >= togo) continue;
            path[depth] = m;
            search(next, togo - 1, depth + 1, m);
          }
        };
        const index = phase2Index(first.cube.centres, parity(first.cube.wp));
        if (phase2[index] <= length) search(index, length, 0, first.moves.at(-1) ?? -1);
      }
    }
    if (stopped() || seconds.length === 0) return { moves: undefined, phases: [] };

    // Phase 3: centres solved, PLL parity even, edges paired; bounded by the centres' exact
    // distance and the edges' distance, tracked exactly up to 9.
    const starts = seconds.map((candidate) => {
      const { cube } = candidate;
      const ud = rankMask(
        maskOf(UD_SLOTS, cube.centres, (c) => c === 0),
        8,
      );
      const fb = rankMask(
        maskOf(FB_SLOTS, cube.centres, (c) => c === 2),
        8,
      );
      const rl = rankMask(
        maskOf(RL_SLOTS, cube.centres, (c) => c === R_COLOUR),
        8,
      );
      const positions = edgePositions(cube.wp);
      if (positions === null) throw new Error('Phase 3 needs one wing of each edge in a low slot');
      const lowEdges = LOW_SLOT.map((slot) => cube.wp[slot] >> 1);
      const pll = parity(lowEdges) ^ parity(cube.cp);
      const edges = edgeState(positions.low, positions.high);
      const distance = edgeDistance(edgeTable, edges);
      const centres = ((ud * N_RL + fb) * N_RL + rl) * 2 + pll;
      const bound = Math.max(centres3[centres], distance);
      return { candidate, centres, edges, distance, bound };
    });
    const total3 = (s: (typeof starts)[number]) => s.candidate.moves.length + s.bound;
    starts.sort((a, b) => total3(a) - total3(b));

    const centreStack = new Int32Array(32);
    const edgeStack = new Uint8Array(33 * 12);
    const distances = new Uint8Array(32);
    const search3 = (depth: number, togo: number, last: number): boolean => {
      if (togo === 0) return true;
      if (stopped()) return false;
      const at = depth * 12;
      for (const m of PHASE3_MOVES) {
        if (!canFollow(last, m)) continue;
        const centres = moveCentres(centreStack[depth], m);
        if (centres3[centres] >= togo) continue;
        const index = edgeIndex(edgeTable, edgeStack, at, m);
        const distance = nextEdgeDistance(edgeTable, index, distances[depth]);
        if (distance >= togo) continue;
        moveEdges(edgeStack, at, at + 12, m);
        centreStack[depth + 1] = centres;
        distances[depth + 1] = distance;
        path[depth] = m;
        if (search3(depth + 1, togo - 1, m)) return true;
      }
      return false;
    };

    // Several reduced cubes, shortest first: their 3×3×3 finishes vary by a few moves.
    const reductions: { candidate: Candidate; moves: number[] }[] = [];
    const lowest3 = starts.length === 0 ? 0 : total3(starts[0]);
    for (let total = lowest3; reductions.length < keep3 && total < lowest3 + 16; total++) {
      for (const start of starts) {
        const length = total - start.candidate.moves.length;
        if (start.bound > length) continue;
        centreStack[0] = start.centres;
        edgeStack.set(start.edges);
        distances[0] = start.distance;
        if (search3(0, length, start.candidate.moves.at(-1) ?? -1)) {
          const moves = Array.from(path.subarray(0, length));
          reductions.push({ candidate: start.candidate, moves });
          if (reductions.length >= keep3) break;
        }
        if (stopped()) return { moves: undefined, phases: [] };
      }
    }

    let best: ReductionResult | undefined;
    for (const { candidate, moves } of reductions) {
      const reduced = replay(candidate.cube, moves);
      const finish = solve3(as3x3(reduced), {
        maxLength: 18,
        timeLimitMs: finishTimeMs,
        directions: 6,
        shouldStop: stopped,
      }).moves;
      if (finish === undefined) return { moves: undefined, phases: [] };
      const solution = simplifyLayerTurns(
        [
          ...[...candidate.moves, ...moves].map((m) => MOVES[m]),
          ...finish.map(({ face, turns }): LayerTurn => ({ face, from: 1, to: 1, turns })),
        ],
        4,
      );
      if (!isSolved4(applyLayerTurns4(input, solution))) {
        throw new Error('The 4×4×4 solution does not solve the cube');
      }
      if (best?.moves === undefined || solution.length < best.moves.length) {
        best = { moves: solution, phases: [...candidate.lengths, moves.length, finish.length] };
      }
    }
    return best ?? { moves: undefined, phases: [] };
  };
}
