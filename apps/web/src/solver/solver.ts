import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from '../ui/storage.ts';
import { SolverClient, type OptimalStatus, type SolverStatus } from './client.ts';

/** Which engine runs in the worker: the TypeScript solvers or their Rust port. */
export type EngineKind = 'typescript' | 'wasm';

export const ENGINE_KINDS: readonly EngineKind[] = ['typescript', 'wasm'];

const STORAGE_KEY = 'cube-solver.engine';

const WORKERS: Readonly<Record<EngineKind, () => Worker>> = {
  typescript: () => new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }),
  wasm: () => new Worker(new URL('./wasm-solver.worker.ts', import.meta.url), { type: 'module' }),
};

let kind: EngineKind = readStored(STORAGE_KEY) === 'wasm' ? 'wasm' : 'typescript';
let client: SolverClient | undefined;
let detach: (() => void) | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** One worker for the page, started on first use and replaced when the engine changes. */
export function getSolverClient(): SolverClient {
  if (client === undefined) {
    client = new SolverClient(WORKERS[kind]);
    detach = client.subscribe(notify);
  }
  return client;
}

/** Switches engines; pending requests of the old one are rejected. */
export function setEngineKind(next: EngineKind): void {
  if (next === kind) return;
  kind = next;
  writeStored(STORAGE_KEY, next);
  detach?.();
  client?.dispose();
  client = undefined;
  getSolverClient();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEngineKind(): EngineKind {
  return useSyncExternalStore(subscribe, () => kind);
}

export function useSolverStatus(): SolverStatus {
  return useSyncExternalStore(subscribe, () => getSolverClient().getStatus());
}

export function useOptimalStatus(): OptimalStatus {
  return useSyncExternalStore(subscribe, () => getSolverClient().getOptimalStatus());
}
