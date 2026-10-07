import {
  FACES,
  MOVES_4,
  slotPermutations,
  type Face,
  type LayerTurn,
  type Turns,
} from '@cube/core';

// Moves of the 4×4×4 reduction: the 18 outer face turns and the 9 wide turns Uw, Rw, Fw, in
// outer block turn metric (each counts one). Dw, Lw and Bw are left out: each equals a wide turn
// of the opposite face combined with a whole-cube rotation, which a 4×4×4 without fixed centres
// does not need. The same choice as Chen Shuang's three-phase reduction (TPR).

export const MOVES: readonly LayerTurn[] = MOVES_4;
export const N_MOVES_4 = MOVES.length;

const TURNS: readonly Turns[] = [1, 2, 3];
const WIDE_FACES: readonly Face[] = ['U', 'R', 'F'];

const index = (face: Face, wide: boolean, turns: Turns) =>
  wide ? 18 + WIDE_FACES.indexOf(face) * 3 + turns - 1 : FACES.indexOf(face) * 3 + turns - 1;

/** Phase 1: everything. */
export const PHASE1_MOVES: readonly number[] = MOVES.map((_, m) => m);

/** Phase 2 keeps the R/L centres on the R/L faces: outer turns, Rw, Uw2 and Fw2. */
export const PHASE2_MOVES: readonly number[] = [
  ...Array.from({ length: 18 }, (_, m) => m),
  index('R', true, 1),
  index('R', true, 2),
  index('R', true, 3),
  index('U', true, 2),
  index('F', true, 2),
];

/**
 * Phase 3 also keeps every centre on its axis, wing parity, and the wing slot classes (see
 * WING_CLASS): U, D, F, B, R2, L2, Uw2, Rw2, Fw2.
 */
export const PHASE3_MOVES: readonly number[] = [
  ...(['U', 'F', 'D', 'B'] as const).flatMap((face) => TURNS.map((t) => index(face, false, t))),
  index('R', false, 2),
  index('L', false, 2),
  index('U', true, 2),
  index('R', true, 2),
  index('F', true, 2),
].sort((a, b) => a - b);

/** Group of a move: its face for outer turns, the face plus 6 for wide ones. */
const group = (m: number) => (m < 18 ? Math.floor(m / 3) : 6 + Math.floor((m - 18) / 3));
const axisOfGroup = [0, 1, 2, 0, 1, 2, 0, 1, 2] as const;

/**
 * Whether m may follow `last` (-1 at the start): not the same group again, and moves on one axis,
 * which commute, only in increasing group order.
 */
export function canFollow(last: number, m: number): boolean {
  if (last < 0) return true;
  const a = group(last);
  const b = group(m);
  if (a === b) return false;
  return axisOfGroup[a] !== axisOfGroup[b] || a < b;
}

/** Slot permutations of each move: after it, slot i holds what slot source[i] held. */
export const WING_MOVES: readonly (readonly number[])[] = MOVES.map(
  (m) => slotPermutations(m).wings,
);
export const CENTRE_MOVES: readonly (readonly number[])[] = MOVES.map(
  (m) => slotPermutations(m).centres,
);

/** Whether a move changes the parity of the wing permutation (inner quarter turns do). */
export const WING_PARITY_FLIP: readonly number[] = WING_MOVES.map((source) => {
  const seen = new Array<boolean>(24).fill(false);
  let parity = 0;
  for (let i = 0; i < 24; i++) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = source[j]) {
      seen[j] = true;
      length++;
    }
    parity ^= (length - 1) & 1;
  }
  return parity;
});

/**
 * Splits the 24 wing slots into two classes of 12 that the phase 3 moves never mix, one slot of
 * each edge position in each: the orbits of those moves on the slots. Class 0 holds slot 0.
 */
export const WING_CLASS: readonly number[] = (() => {
  const cls = new Array<number>(24).fill(-1);
  cls[0] = 0;
  const queue = [0];
  // The queue grows while it is read: for-of visits what is pushed during the loop too.
  for (const slot of queue) {
    for (const m of PHASE3_MOVES) {
      const source = WING_MOVES[m];
      const target = source.indexOf(slot);
      if (cls[target] === -1) {
        cls[target] = 0;
        queue.push(target);
      }
    }
  }
  for (let s = 0; s < 24; s++) if (cls[s] === -1) cls[s] = 1;
  // Each edge position (slots 2e and 2e + 1) must have one slot of each class, and the class-1
  // slots must form an orbit too; otherwise the phase 3 moves could not pair edges.
  for (let e = 0; e < 12; e++) {
    if (cls[2 * e] === cls[2 * e + 1]) throw new Error('Wing classes do not split the edges');
  }
  return cls;
})();

/** For each edge position, its class-0 ("low") slot and its class-1 ("high") slot. */
export const LOW_SLOT: readonly number[] = Array.from({ length: 12 }, (_, e) =>
  WING_CLASS[2 * e] === 0 ? 2 * e : 2 * e + 1,
);
export const HIGH_SLOT: readonly number[] = LOW_SLOT.map((s) => (s % 2 === 0 ? s + 1 : s - 1));

/**
 * The permutations a phase 3 move induces on the 12 low slots and the 12 high slots, by edge
 * position: low[m][p] is the position whose low slot moves into position p's low slot.
 */
export const PHASE3_LOW: readonly (readonly number[])[] = MOVES.map((_, m) =>
  LOW_SLOT.map((slot) => LOW_SLOT.indexOf(WING_MOVES[m][slot])),
);
export const PHASE3_HIGH: readonly (readonly number[])[] = MOVES.map((_, m) =>
  HIGH_SLOT.map((slot) => HIGH_SLOT.indexOf(WING_MOVES[m][slot])),
);
