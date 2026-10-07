import { N_CORNER_PERM, N_FLIP, N_SLICE_SORTED, N_TWIST } from './coordinates.ts';
import { buildFlipSliceClasses, type FlipSliceClasses } from './sym-coordinates.ts';
import { buildTwistConjugation, N_SYM } from './symmetry.ts';
import { N_MOVES, type TwoPhaseTables } from './tables.ts';

/**
 * `standard`: distance to the phase 1 subgroup, FlipUDSlice classes × twist (Reid's optimal
 * solver, about 35 MB). `huge`: distance to the smaller subgroup that also puts the slice edges in
 * order, FlipUDSliceSorted classes × twist (Kociemba's optimal solver, about 0.8 GB).
 */
export type OptimalTier = 'standard' | 'huge';

export interface OptimalTables {
  readonly tier: OptimalTier;
  readonly classes: FlipSliceClasses;
  readonly twistConj: Uint16Array;
  /**
   * Distance mod 3 of each (class, twist) entry, 2 bits each, 16 per word. A move changes the
   * distance by at most one, so the exact distance follows from the parent's (Kociemba,
   * https://kociemba.org/math/pruning.htm). During the build, 3 marks an entry not reached yet.
   */
  readonly prune: Uint32Array;
  /** The prune table with its file header in front, ready to be cached as is. */
  readonly file: Uint8Array;
  /** Exact distance to solved corner positions (permutation only), a cheap extra bound. */
  readonly cornerDepth: Uint8Array;
  readonly twistMove: Uint16Array;
  readonly flipMove: Uint16Array;
  readonly sliceMove: Uint16Array;
  readonly sliceSortedMove: Uint16Array;
  readonly cornerPermMove: Uint16Array;
}

export interface OptimalBuildHooks {
  /** Entries filled out of the total, reported every few thousand classes. */
  readonly onProgress?: (done: number, total: number) => void;
  /** Polled during the build; returning true abandons it. */
  readonly shouldStop?: () => boolean;
}

export type MoveTables = Pick<
  TwoPhaseTables,
  'twistMove' | 'flipMove' | 'sliceMove' | 'sliceSortedMove' | 'cornerPermMove'
>;

// File layout, little-endian 32-bit words: magic, format version, tier (0 standard, 1 huge),
// class count, entry count, FNV-1a checksum of the table words, two reserved words; then the
// table. The Rust engine writes and reads the same bytes.
const MAGIC = 0x3154_504f; // "OPT1"
const FORMAT_VERSION = 1;
const HEADER_WORDS = 8;
const EMPTY = 0xffffffff;
const PROGRESS_EVERY = 4096;

export function pruneEntries(classes: number): number {
  return classes * N_TWIST;
}

function checksum(words: Uint32Array): number {
  let hash = 0x811c9dc5;
  for (const word of words) hash = Math.imul(hash ^ word, 0x01000193);
  return hash >>> 0;
}

function writeHeader(file: Uint32Array, tier: OptimalTier, classes: number): void {
  file[0] = MAGIC;
  file[1] = FORMAT_VERSION;
  file[2] = tier === 'huge' ? 1 : 0;
  file[3] = classes;
  file[4] = pruneEntries(classes) >>> 0;
  file[5] = checksum(file.subarray(HEADER_WORDS));
}

/** The table inside a cached file, or null if the file is from another version or damaged. */
export function readPruneFile(
  bytes: Uint8Array,
  tier: OptimalTier,
  classes: number,
): Uint32Array | null {
  const words = Math.ceil(pruneEntries(classes) / 16);
  if (bytes.byteOffset % 4 !== 0 || bytes.byteLength !== (HEADER_WORDS + words) * 4) return null;
  const file = new Uint32Array(bytes.buffer, bytes.byteOffset, HEADER_WORDS + words);
  const table = file.subarray(HEADER_WORDS);
  const valid =
    file[0] === MAGIC &&
    file[1] === FORMAT_VERSION &&
    file[2] === (tier === 'huge' ? 1 : 0) &&
    file[3] === classes &&
    file[4] === pruneEntries(classes) >>> 0 &&
    file[5] === checksum(table);
  return valid ? table : null;
}

function buildCornerDepth(cornerPermMove: Uint16Array): Uint8Array {
  const depth = new Uint8Array(N_CORNER_PERM).fill(255);
  depth[0] = 0;
  let done = 1;
  for (let level = 0; done < N_CORNER_PERM; level++) {
    for (let c = 0; c < N_CORNER_PERM; c++) {
      if (depth[c] !== level) continue;
      for (let m = 0; m < N_MOVES; m++) {
        const next = cornerPermMove[c * N_MOVES + m];
        if (depth[next] === 255) {
          depth[next] = level + 1;
          done++;
        }
      }
    }
  }
  return depth;
}

/**
 * Breadth-first search over (class, twist) entries from the target subgroup. Entries of
 * representatives fixed by a symmetry come in groups of equivalent twists, and the forward search
 * fills each group at once (as Kociemba's pruning.py does), because moves from representatives
 * only ever reach one entry of a group. Once most entries are known, every unknown entry instead
 * looks for a neighbour on the current level and stops at the first.
 */
function fillPruneTable(
  table: Uint32Array,
  classes: FlipSliceClasses,
  twistConj: Uint16Array,
  moves: MoveTables,
  hooks: OptimalBuildHooks,
): boolean {
  const { count, classOf, representative, stabilizer, sorted } = classes;
  const { twistMove, flipMove } = moves;
  const sliceMoves = sorted ? moves.sliceSortedMove : moves.sliceMove;
  const total = pruneEntries(count);
  table.fill(EMPTY);
  table[0] = (table[0] & ~3) >>> 0; // the target: class 0 (raw 0), twist 0, depth 0
  let done = 1;

  for (let level = 0; done < total; level++) {
    const backward = done > total / 2;
    const current = level % 3;
    const next = (level + 1) % 3;
    let found = 0;
    for (let c = 0; c < count; c++) {
      if (c % PROGRESS_EVERY === 0) {
        if (hooks.shouldStop?.() === true) return false;
        hooks.onProgress?.(done + found, total);
      }
      const rep = representative[c];
      const flipRow = (rep % N_FLIP) * N_MOVES;
      const sliceRow = Math.floor(rep / N_FLIP) * N_MOVES;
      const base = c * N_TWIST;
      for (let twist = 0; twist < N_TWIST; twist++) {
        const index = base + twist;
        const word = table[index >>> 4];
        if (!backward && word === EMPTY && (index & 15) === 0 && twist + 16 <= N_TWIST) {
          twist += 15;
          continue;
        }
        const value = (word >>> ((index & 15) << 1)) & 3;
        if (backward ? value !== 3 : value !== current) continue;
        const twistRow = twist * N_MOVES;
        for (let m = 0; m < N_MOVES; m++) {
          const packed = classOf[sliceMoves[sliceRow + m] * N_FLIP + flipMove[flipRow + m]];
          const c1 = packed >>> 4;
          const t1 = twistConj[twistMove[twistRow + m] * N_SYM + (packed & 15)];
          const index1 = c1 * N_TWIST + t1;
          const value1 = (table[index1 >>> 4] >>> ((index1 & 15) << 1)) & 3;
          if (backward) {
            if (value1 === current) {
              const shift = (index & 15) << 1;
              table[index >>> 4] = (table[index >>> 4] & ~(3 << shift)) | (next << shift);
              found++;
              break;
            }
            continue;
          }
          if (value1 !== 3) continue;
          const shift1 = (index1 & 15) << 1;
          table[index1 >>> 4] = (table[index1 >>> 4] & ~(3 << shift1)) | (next << shift1);
          found++;
          const stable = stabilizer[c1];
          if (stable === 1) continue;
          for (let s = 1; s < N_SYM; s++) {
            if (((stable >>> s) & 1) === 0) continue;
            const index2 = c1 * N_TWIST + twistConj[t1 * N_SYM + s];
            const shift2 = (index2 & 15) << 1;
            if (((table[index2 >>> 4] >>> shift2) & 3) !== 3) continue;
            table[index2 >>> 4] = (table[index2 >>> 4] & ~(3 << shift2)) | (next << shift2);
            found++;
          }
        }
      }
    }
    if (found === 0) throw new Error(`Prune table stuck at ${String(done)} of ${String(total)}`);
    done += found;
  }
  hooks.onProgress?.(done, total);
  return true;
}

/**
 * Builds the optimal solver's tables, or restores the prune table from a file saved earlier,
 * which skips the expensive part. Returns null when stopped through `hooks.shouldStop`.
 */
export function buildOptimalTables(
  tier: OptimalTier,
  moves: MoveTables,
  saved: Uint8Array | null = null,
  hooks: OptimalBuildHooks = {},
): OptimalTables | null {
  const classes = buildFlipSliceClasses(tier === 'huge');
  const twistConj = buildTwistConjugation();
  const restored = saved === null ? null : readPruneFile(saved, tier, classes.count);
  let prune: Uint32Array;
  let file: Uint8Array;
  if (restored !== null && saved !== null) {
    prune = restored;
    file = saved;
  } else {
    const words = new Uint32Array(HEADER_WORDS + Math.ceil(pruneEntries(classes.count) / 16));
    prune = words.subarray(HEADER_WORDS);
    if (!fillPruneTable(prune, classes, twistConj, moves, hooks)) return null;
    writeHeader(words, tier, classes.count);
    file = new Uint8Array(words.buffer);
  }
  return {
    tier,
    classes,
    twistConj,
    prune,
    file,
    cornerDepth: buildCornerDepth(moves.cornerPermMove),
    twistMove: moves.twistMove,
    flipMove: moves.flipMove,
    sliceMove: moves.sliceMove,
    sliceSortedMove: moves.sliceSortedMove,
    cornerPermMove: moves.cornerPermMove,
  };
}

/** Slice positions (0..494) of each sliceSorted value. */
export const SLICE_OF_SORTED: Uint16Array = Uint16Array.from({ length: N_SLICE_SORTED }, (_, i) =>
  Math.floor(i / 24),
);
