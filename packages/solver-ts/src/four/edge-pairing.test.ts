import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildEdgePairing,
  edgeDistance,
  moveEdges,
  N_EDGE_STATES_PER_CLASS,
  type EdgePairingTable,
} from './edge-pairing.ts';
import { PHASE3_MOVES } from './moves.ts';

let table: EdgePairingTable;
beforeAll(() => {
  table = buildEdgePairing();
});

describe('edge pairing table', () => {
  // TPR's Edge3.java (github.com/cs0x7f/TPR-4x4x4-Solver): N_SYM = 1538 classes of the first four
  // entries, and prunValues[9] = 2,778,197 states within 9 moves.
  it('has the classes and the depth counts of TPR’s Edge3 table', () => {
    expect(table.symToRaw.length).toBe(1538);
    let known = 0;
    for (let i = 0; i < table.symToRaw.length * N_EDGE_STATES_PER_CLASS; i++) {
      if (((table.prune[i >>> 4] >>> ((i & 15) << 1)) & 3) !== 3) known++;
    }
    expect(known).toBe(2_778_197);
  });

  it('agrees with a breadth-first search over the plain permutations', () => {
    const paired = Uint8Array.from({ length: 12 }, (_, i) => i);
    const depth = new Map<string, number>([[paired.join(), 0]]);
    let frontier: Uint8Array[] = [paired];
    for (let d = 1; d <= 6; d++) {
      const next: Uint8Array[] = [];
      for (const state of frontier) {
        for (const m of PHASE3_MOVES) {
          const buffer = new Uint8Array(24);
          buffer.set(state);
          moveEdges(buffer, 0, 12, m);
          const moved = buffer.slice(12);
          if (depth.has(moved.join())) continue;
          depth.set(moved.join(), d);
          next.push(moved);
        }
      }
      frontier = next;
    }
    expect(depth.size).toBe(71_552);
    for (const [key, d] of depth) {
      expect(edgeDistance(table, Uint8Array.from(key.split(','), Number))).toBe(d);
    }
  });
});
