import type { Cube4, CubieCube } from '@cube/core';
import {
  CANCEL_FLAG,
  type FourResult,
  type FromWorker,
  type OptimalTier,
  type PrepareReport,
  type SolveOptions,
  type SolveProgress,
  type SolveResult,
  type ToWorker,
} from '@cube/solver-contracts';

export type SolverStatus =
  | { readonly kind: 'starting'; readonly done: number; readonly total: number }
  | { readonly kind: 'ready'; readonly initMs: number; readonly tableBytes: number }
  | { readonly kind: 'failed'; readonly message: string };

/** Whether the optimal mode's tables are in the worker. */
export type OptimalStatus =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'preparing';
      readonly tier: OptimalTier;
      readonly done: number;
      readonly total: number;
    }
  | { readonly kind: 'ready'; readonly report: PrepareReport }
  | { readonly kind: 'failed'; readonly tier: OptimalTier; readonly message: string };

/** Whether the 4×4×4 tables are in the worker. */
export type FourStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'preparing'; readonly done: number; readonly total: number }
  | { readonly kind: 'ready'; readonly tableBytes: number; readonly ms: number }
  | { readonly kind: 'failed'; readonly message: string };

export interface SolveCallbacks {
  readonly onProgress?: (progress: SolveProgress) => void;
  readonly onImproved?: (moves: readonly number[]) => void;
}

export interface Handle<T> {
  readonly result: Promise<T>;
  cancel(): void;
}

export type SolveHandle = Handle<SolveResult>;

/** The parts of a Worker the client uses, so tests can drive it without a browser. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: ToWorker): void;
  terminate(): void;
}

type Pending =
  | {
      readonly kind: 'solve';
      readonly resolve: (result: SolveResult) => void;
      readonly reject: (error: Error) => void;
      readonly callbacks: SolveCallbacks;
      readonly flag: Int32Array<SharedArrayBuffer> | undefined;
    }
  | {
      readonly kind: 'prepare';
      readonly tier: OptimalTier;
      readonly resolve: (report: PrepareReport | null) => void;
      readonly reject: (error: Error) => void;
      readonly flag: Int32Array<SharedArrayBuffer> | undefined;
    }
  | {
      readonly kind: 'prepare-four';
      readonly resolve: () => void;
      readonly reject: (error: Error) => void;
      readonly flag: undefined;
    }
  | {
      readonly kind: 'solve-four';
      readonly resolve: (result: FourResult) => void;
      readonly reject: (error: Error) => void;
      readonly flag: Int32Array<SharedArrayBuffer> | undefined;
    };

const CANCELLED: SolveResult = { moves: null, stoppedBy: 'cancelled', nodes: 0, elapsedMs: 0 };
const CANCELLED_FOUR: FourResult = { moves: null, phases: [], elapsedMs: 0 };

/**
 * Owns the solver worker. Cancellation sets a flag in shared memory that the worker polls; where
 * shared memory is unavailable (no cross-origin isolation) the worker is replaced instead, which
 * costs a rebuild of the fast tables and drops the optimal ones.
 */
export class SolverClient {
  readonly #createWorker: () => WorkerLike;
  readonly #sharedMemory: boolean;
  readonly #listeners = new Set<() => void>();
  readonly #pending = new Map<number, Pending>();
  #worker: WorkerLike;
  #status: SolverStatus = { kind: 'starting', done: 0, total: 1 };
  #optimal: OptimalStatus = { kind: 'none' };
  #four: FourStatus = { kind: 'none' };
  #nextId = 1;

  constructor(createWorker: () => WorkerLike, sharedMemory = canShareMemory()) {
    this.#createWorker = createWorker;
    this.#sharedMemory = sharedMemory;
    this.#worker = this.#spawn();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getStatus = (): SolverStatus => this.#status;

  readonly getOptimalStatus = (): OptimalStatus => this.#optimal;

  readonly getFourStatus = (): FourStatus => this.#four;

  solve(cube: CubieCube, options: SolveOptions, callbacks: SolveCallbacks = {}): SolveHandle {
    const id = this.#nextId++;
    const flag = this.#newFlag();
    const result = new Promise<SolveResult>((resolve, reject) => {
      this.#pending.set(id, { kind: 'solve', resolve, reject, callbacks, flag });
    });
    this.#worker.postMessage({ type: 'solve', id, cube, options, ...this.#flagField(flag) });
    return {
      result,
      cancel: () => {
        this.#cancel(id);
      },
    };
  }

  /** Builds or loads the optimal tables for a tier; the report is null if cancelled. */
  prepare(tier: OptimalTier): Handle<PrepareReport | null> {
    const id = this.#nextId++;
    const flag = this.#newFlag();
    const result = new Promise<PrepareReport | null>((resolve, reject) => {
      this.#pending.set(id, { kind: 'prepare', tier, resolve, reject, flag });
    });
    this.#setOptimal({ kind: 'preparing', tier, done: 0, total: 1 });
    this.#worker.postMessage({ type: 'prepare', id, tier, ...this.#flagField(flag) });
    return {
      result,
      cancel: () => {
        this.#cancel(id);
      },
    };
  }

  /** Builds the 4×4×4 tables ahead of the first solve. */
  prepareFour(): Promise<void> {
    const id = this.#nextId++;
    const result = new Promise<void>((resolve, reject) => {
      this.#pending.set(id, { kind: 'prepare-four', resolve, reject, flag: undefined });
    });
    if (this.#four.kind !== 'ready') this.#setFour({ kind: 'preparing', done: 0, total: 1 });
    this.#worker.postMessage({ type: 'prepare-four', id });
    return result;
  }

  solveFour(cube: Cube4): Handle<FourResult> {
    const id = this.#nextId++;
    const flag = this.#newFlag();
    const result = new Promise<FourResult>((resolve, reject) => {
      this.#pending.set(id, { kind: 'solve-four', resolve, reject, flag });
    });
    this.#worker.postMessage({ type: 'solve-four', id, cube, ...this.#flagField(flag) });
    return {
      result,
      cancel: () => {
        this.#cancel(id);
      },
    };
  }

  dispose(): void {
    this.#worker.terminate();
    for (const pending of this.#pending.values()) pending.reject(new Error('Solver disposed'));
    this.#pending.clear();
  }

  #newFlag(): Int32Array<SharedArrayBuffer> | undefined {
    return this.#sharedMemory ? new Int32Array(new SharedArrayBuffer(4)) : undefined;
  }

  #flagField(flag: Int32Array<SharedArrayBuffer> | undefined) {
    return flag === undefined ? {} : { cancelFlag: flag.buffer };
  }

  #spawn(): WorkerLike {
    const worker = this.#createWorker();
    worker.onmessage = (event) => {
      this.#receive(event.data);
    };
    worker.onerror = (event) => {
      this.#setStatus({ kind: 'failed', message: event.message });
    };
    return worker;
  }

  #cancel(id: number): void {
    const pending = this.#pending.get(id);
    if (pending === undefined) return;
    if (pending.flag !== undefined) {
      Atomics.store(pending.flag, CANCEL_FLAG, 1);
      return;
    }
    this.#worker.terminate();
    for (const queued of this.#pending.values()) {
      switch (queued.kind) {
        case 'solve':
          queued.resolve(CANCELLED);
          break;
        case 'prepare':
          queued.resolve(null);
          break;
        case 'prepare-four':
          queued.resolve();
          break;
        case 'solve-four':
          queued.resolve(CANCELLED_FOUR);
      }
    }
    this.#pending.clear();
    this.#setOptimal({ kind: 'none' });
    this.#setFour({ kind: 'none' });
    this.#setStatus({ kind: 'starting', done: 0, total: 1 });
    this.#worker = this.#spawn();
  }

  #receive(message: FromWorker): void {
    switch (message.type) {
      case 'init-progress':
        this.#setStatus({ kind: 'starting', done: message.done, total: message.total });
        return;
      case 'ready':
        this.#setStatus({ kind: 'ready', initMs: message.initMs, tableBytes: message.tableBytes });
        return;
      case 'progress': {
        const pending = this.#pending.get(message.id);
        if (pending?.kind === 'solve') pending.callbacks.onProgress?.(message.progress);
        return;
      }
      case 'improved': {
        const pending = this.#pending.get(message.id);
        if (pending?.kind === 'solve') pending.callbacks.onImproved?.(message.moves);
        return;
      }
      case 'result': {
        const pending = this.#pending.get(message.id);
        if (pending?.kind === 'solve') pending.resolve(message.result);
        this.#pending.delete(message.id);
        return;
      }
      case 'prepare-progress': {
        const pending = this.#pending.get(message.id);
        if (pending?.kind !== 'prepare') return;
        this.#setOptimal({
          kind: 'preparing',
          tier: pending.tier,
          done: message.done,
          total: message.total,
        });
        return;
      }
      case 'prepared': {
        const pending = this.#pending.get(message.id);
        if (pending?.kind !== 'prepare') return;
        this.#pending.delete(message.id);
        this.#setOptimal(
          message.report === null ? { kind: 'none' } : { kind: 'ready', report: message.report },
        );
        pending.resolve(message.report);
        return;
      }
      case 'four-progress':
        this.#setFour({ kind: 'preparing', done: message.done, total: message.total });
        return;
      case 'four-ready': {
        // Every solve reports the tables ready; the first report carries the build time.
        if (this.#four.kind !== 'ready') {
          this.#setFour({ kind: 'ready', tableBytes: message.tableBytes, ms: message.ms });
        }
        const pending = this.#pending.get(message.id);
        if (pending?.kind !== 'prepare-four') return;
        this.#pending.delete(message.id);
        pending.resolve();
        return;
      }
      case 'four-result': {
        const pending = this.#pending.get(message.id);
        if (pending?.kind === 'solve-four') pending.resolve(message.result);
        this.#pending.delete(message.id);
        return;
      }
      case 'error': {
        if (message.id === null) {
          this.#setStatus({ kind: 'failed', message: message.message });
          return;
        }
        const pending = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (pending?.kind === 'prepare') {
          this.#setOptimal({ kind: 'failed', tier: pending.tier, message: message.message });
        }
        if (
          (pending?.kind === 'prepare-four' || pending?.kind === 'solve-four') &&
          this.#four.kind !== 'ready'
        ) {
          this.#setFour({ kind: 'failed', message: message.message });
        }
        pending?.reject(new Error(message.message));
      }
    }
  }

  #setStatus(status: SolverStatus): void {
    this.#status = status;
    this.#notify();
  }

  #setOptimal(status: OptimalStatus): void {
    this.#optimal = status;
    this.#notify();
  }

  #setFour(status: FourStatus): void {
    this.#four = status;
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

function canShareMemory(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated;
}
