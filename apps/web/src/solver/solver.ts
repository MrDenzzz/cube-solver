import { useSyncExternalStore } from 'react';
import { SolverClient, type SolverStatus } from './client.ts';

let client: SolverClient | undefined;

/** One worker for the page, started on first use and kept for its lifetime. */
export function getSolverClient(): SolverClient {
  client ??= new SolverClient(
    () => new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }),
  );
  return client;
}

export function useSolverStatus(): SolverStatus {
  const solver = getSolverClient();
  return useSyncExternalStore(solver.subscribe, solver.getStatus);
}
