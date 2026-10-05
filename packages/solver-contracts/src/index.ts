import type { CubieCube } from '@cube/core';

// The protocol between the UI thread and a solver worker. It is engine-neutral: the TypeScript and
// the WebAssembly engines implement the same messages, and moves travel as face turn indices
// (0..17 in Kociemba's order U, U2, U', R, …, B') so no engine needs the other's types.

export interface SolveOptions {
  /** Stop at the first solution of at most this many moves. */
  readonly maxLength: number;
  /** Then return the best solution found so far. */
  readonly timeLimitMs: number;
}

export type StopReason = 'target' | 'time' | 'cancelled' | 'exhausted';

export interface SolveProgress {
  /** Phase 1 search depth being explored. */
  readonly depth: number;
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

export interface SolveHooks {
  readonly shouldStop: () => boolean;
  readonly onProgress: (progress: SolveProgress) => void;
  readonly onImprovement: (moves: readonly number[]) => void;
}

/** What a worker needs from an engine. Both calls are synchronous: they run inside the worker. */
export interface SolverEngine {
  readonly name: string;
  /** Builds or loads the tables, reporting steps done out of total. */
  init(onProgress: (done: number, total: number) => void): { readonly tableBytes: number };
  solve(cube: CubieCube, options: SolveOptions, hooks: SolveHooks): SolveResult;
}

/** Slot in the shared Int32Array that a worker polls to abandon the current search. */
export const CANCEL_FLAG = 0;

export interface ToWorker {
  readonly type: 'solve';
  readonly id: number;
  readonly cube: CubieCube;
  readonly options: SolveOptions;
  /**
   * A synchronous search keeps the worker from reading messages, so cancellation goes through
   * shared memory. Absent without cross-origin isolation; the client then restarts the worker.
   */
  readonly cancelFlag?: SharedArrayBuffer;
}

export type FromWorker =
  | { readonly type: 'init-progress'; readonly done: number; readonly total: number }
  | { readonly type: 'ready'; readonly initMs: number; readonly tableBytes: number }
  | { readonly type: 'progress'; readonly id: number; readonly progress: SolveProgress }
  | { readonly type: 'improved'; readonly id: number; readonly moves: readonly number[] }
  | { readonly type: 'result'; readonly id: number; readonly result: SolveResult }
  | { readonly type: 'error'; readonly id: number | null; readonly message: string };
