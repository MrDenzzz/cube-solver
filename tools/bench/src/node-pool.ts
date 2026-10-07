import type { HelperPool } from '@cube/solver-ts';
import { Worker } from 'node:worker_threads';

/** Optimal-search helpers as Node worker threads, for benchmarks and tests. */
export function nodeHelperPool(size: number): HelperPool {
  const workers = Array.from(
    { length: size },
    () => new Worker(new URL('./node-helper.ts', import.meta.url)),
  );
  return {
    size,
    start(init) {
      workers[init.index - 1]?.postMessage(init);
    },
    terminate() {
      for (const worker of workers) void worker.terminate();
    },
  };
}
