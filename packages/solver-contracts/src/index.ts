import type { Cube4, CubieCube } from '@cube/core';

// The protocol between the UI thread and a solver worker. It is engine-neutral: the TypeScript and
// the WebAssembly engines implement the same messages, and moves travel as face turn indices
// (0..17 in Kociemba's order U, U2, U', R, …, B') so no engine needs the other's types. 4×4×4
// moves are indices into MOVES_4 of @cube/core.

/**
 * Table size of the optimal solver: `standard` is about 35 MB and suits any device; `huge` is
 * about 0.9 GB with its index and solves several times faster, on desktops.
 */
export type OptimalTier = 'standard' | 'huge';

export type SolveOptions =
  | {
      /** Kociemba's two-phase algorithm: short solutions within milliseconds. */
      readonly mode: 'fast';
      /** Stop at the first solution of at most this many moves. */
      readonly maxLength: number;
      /** Then return the best solution found so far. */
      readonly timeLimitMs: number;
    }
  | {
      /** A shortest solution, proven: IDA* until every shorter length is ruled out. */
      readonly mode: 'optimal';
      readonly tier: OptimalTier;
    };

/**
 * `proven`: the solution is optimal. `target`: one of at most the requested length was found.
 * `time`: the time limit passed; the best solution so far is returned. `exhausted`: the search
 * space within the limits is done.
 */
export type StopReason = 'proven' | 'target' | 'time' | 'cancelled' | 'exhausted';

export interface SolveProgress {
  /**
   * Fast mode: the phase 1 depth being explored. Optimal mode: the length being searched, so
   * every shorter solution has been ruled out.
   */
  readonly depth: number;
  /** Length of the best solution known so far. */
  readonly bestLength: number | null;
  readonly nodes: number;
  readonly elapsedMs: number;
}

export interface SolveResult {
  /** Face turn indices, or null when cancelled before any solution was found. */
  readonly moves: readonly number[] | null;
  readonly stoppedBy: StopReason;
  readonly nodes: number;
  readonly elapsedMs: number;
}

/** The 4×4×4 reduction's answer. */
export interface FourResult {
  /** Indices into MOVES_4, or null when cancelled. */
  readonly moves: readonly number[] | null;
  /** Moves of the three reduction phases and of the 3×3×3 finish, before merging at the seams. */
  readonly phases: readonly number[];
  readonly elapsedMs: number;
}

/** The 4×4×4 solver, for engines that have one. */
export interface FourSolver {
  /** Builds the tables once; later calls return at once. Reports steps done out of total. */
  prepare(onProgress: (done: number, total: number) => void): { readonly tableBytes: number };
  solve(cube: Cube4, shouldStop: () => boolean): FourResult;
}

export interface SolveHooks {
  readonly shouldStop: () => boolean;
  readonly onProgress: (progress: SolveProgress) => void;
  readonly onImprovement: (moves: readonly number[]) => void;
}

export interface PrepareHooks {
  /** Table entries done out of the total. */
  readonly onProgress: (done: number, total: number) => void;
  readonly shouldStop: () => boolean;
}

export interface PreparedTables {
  readonly tableBytes: number;
  /** The tables as one file to cache; byte-identical between engines. */
  readonly file: Uint8Array;
  /** Whether the saved file was valid and used, so nothing new needs saving. */
  readonly restored: boolean;
}

/** What a worker needs from an engine. All calls are synchronous: they run inside the worker. */
export interface SolverEngine {
  readonly name: string;
  /**
   * A buffer to read a saved table file into, placed where the engine uses it without a copy:
   * shared memory for threads, or a WebAssembly engine's own memory.
   */
  allocateTableFile(size: number): Uint8Array;
  /** Builds the fast mode's tables, reporting steps done out of total. */
  init(onProgress: (done: number, total: number) => void): { readonly tableBytes: number };
  /**
   * Makes the optimal mode ready for a tier, from a file saved earlier when it is valid, or by
   * building the tables. Null when stopped through the hooks.
   */
  prepareOptimal(
    tier: OptimalTier,
    saved: Uint8Array | null,
    hooks: PrepareHooks,
  ): PreparedTables | null;
  solve(cube: CubieCube, options: SolveOptions, hooks: SolveHooks): SolveResult;
  readonly four?: FourSolver;
}

/** Slot in the shared Int32Array that a worker polls to abandon the current task. */
export const CANCEL_FLAG = 0;

/**
 * A synchronous search keeps the worker from reading messages, so cancellation goes through
 * shared memory. Absent without cross-origin isolation; the client then restarts the worker.
 */
interface Cancellable {
  readonly id: number;
  readonly cancelFlag?: SharedArrayBuffer;
}

export interface SolveRequest extends Cancellable {
  readonly type: 'solve';
  readonly cube: CubieCube;
  readonly options: SolveOptions;
}

export interface PrepareRequest extends Cancellable {
  readonly type: 'prepare';
  readonly tier: OptimalTier;
}

export interface PrepareFourRequest {
  readonly type: 'prepare-four';
  readonly id: number;
}

/** Prepares the 4×4×4 tables first if needed. */
export interface SolveFourRequest extends Cancellable {
  readonly type: 'solve-four';
  readonly cube: Cube4;
}

export type ToWorker = SolveRequest | PrepareRequest | PrepareFourRequest | SolveFourRequest;

export interface PrepareReport {
  readonly tier: OptimalTier;
  /** Restored from the browser's storage, or built now. */
  readonly source: 'cache' | 'built';
  readonly tableBytes: number;
  readonly ms: number;
  /** Why the built tables could not be stored, if they could not. */
  readonly cacheError: string | null;
}

export type FromWorker =
  | { readonly type: 'init-progress'; readonly done: number; readonly total: number }
  | { readonly type: 'ready'; readonly initMs: number; readonly tableBytes: number }
  | { readonly type: 'progress'; readonly id: number; readonly progress: SolveProgress }
  | { readonly type: 'improved'; readonly id: number; readonly moves: readonly number[] }
  | { readonly type: 'result'; readonly id: number; readonly result: SolveResult }
  | {
      readonly type: 'prepare-progress';
      readonly id: number;
      readonly done: number;
      readonly total: number;
    }
  /** The report, or null when the preparation was cancelled. */
  | { readonly type: 'prepared'; readonly id: number; readonly report: PrepareReport | null }
  | {
      readonly type: 'four-progress';
      readonly id: number;
      readonly done: number;
      readonly total: number;
    }
  | {
      readonly type: 'four-ready';
      readonly id: number;
      readonly tableBytes: number;
      readonly ms: number;
    }
  | { readonly type: 'four-result'; readonly id: number; readonly result: FourResult }
  | { readonly type: 'error'; readonly id: number | null; readonly message: string };
