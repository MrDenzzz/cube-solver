import type { CubieCube } from '@cube/core';
import {
  CANCEL_FLAG,
  type FromWorker,
  type SolveOptions,
  type SolveProgress,
  type SolveResult,
  type ToWorker,
} from '@cube/solver-contracts';

export type SolverStatus =
  | { readonly kind: 'starting'; readonly done: number; readonly total: number }
  | { readonly kind: 'ready'; readonly initMs: number; readonly tableBytes: number }
  | { readonly kind: 'failed'; readonly message: string };

export interface SolveCallbacks {
  readonly onProgress?: (progress: SolveProgress) => void;
  readonly onImproved?: (moves: readonly number[]) => void;
}

export interface SolveHandle {
  readonly result: Promise<SolveResult>;
  cancel(): void;
}

/** The parts of a Worker the client uses, so tests can drive it without a browser. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: ToWorker): void;
  terminate(): void;
}

interface Pending {
  readonly resolve: (result: SolveResult) => void;
  readonly reject: (error: Error) => void;
  readonly callbacks: SolveCallbacks;
  readonly flag: Int32Array<SharedArrayBuffer> | undefined;
}

const CANCELLED: SolveResult = { moves: null, stoppedBy: 'cancelled', nodes: 0, elapsedMs: 0 };

/**
 * Owns the solver worker. Cancellation sets a flag in shared memory that the search polls; where
 * shared memory is unavailable (no cross-origin isolation) the worker is replaced instead, which
 * costs one table build.
 */
export class SolverClient {
  readonly #createWorker: () => WorkerLike;
  readonly #sharedMemory: boolean;
  readonly #listeners = new Set<() => void>();
  readonly #pending = new Map<number, Pending>();
  #worker: WorkerLike;
  #status: SolverStatus = { kind: 'starting', done: 0, total: 1 };
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

  solve(cube: CubieCube, options: SolveOptions, callbacks: SolveCallbacks = {}): SolveHandle {
    const id = this.#nextId++;
    const flag = this.#sharedMemory ? new Int32Array(new SharedArrayBuffer(4)) : undefined;
    const result = new Promise<SolveResult>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, callbacks, flag });
    });
    this.#worker.postMessage(
      flag === undefined
        ? { type: 'solve', id, cube, options }
        : { type: 'solve', id, cube, options, cancelFlag: flag.buffer },
    );
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
    for (const queued of this.#pending.values()) queued.resolve(CANCELLED);
    this.#pending.clear();
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
      case 'progress':
        this.#pending.get(message.id)?.callbacks.onProgress?.(message.progress);
        return;
      case 'improved':
        this.#pending.get(message.id)?.callbacks.onImproved?.(message.moves);
        return;
      case 'result':
        this.#pending.get(message.id)?.resolve(message.result);
        this.#pending.delete(message.id);
        return;
      case 'error':
        if (message.id === null) {
          this.#setStatus({ kind: 'failed', message: message.message });
        } else {
          this.#pending.get(message.id)?.reject(new Error(message.message));
          this.#pending.delete(message.id);
        }
    }
  }

  #setStatus(status: SolverStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}

function canShareMemory(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated;
}
