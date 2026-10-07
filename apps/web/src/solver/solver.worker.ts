import type { FromWorker, ToWorker } from '@cube/solver-contracts';
import { createTypeScriptEngine, type HelperPool } from '@cube/solver-ts';
import { availableStorage } from './opfs-storage.ts';
import { startWorkerHost } from './worker-host.ts';

/**
 * Helpers for the optimal search, one per core beyond this worker and the page's own thread.
 * Shared memory needs cross-origin isolation; without it the search runs here alone.
 */
function helperPool(): (() => HelperPool) | undefined {
  const size = Math.min(navigator.hardwareConcurrency - 2, 15);
  if (!crossOriginIsolated || size < 1) return undefined;
  return () => {
    const workers = Array.from(
      { length: size },
      () => new Worker(new URL('./optimal-helper.worker.ts', import.meta.url), { type: 'module' }),
    );
    return {
      size,
      start(init) {
        workers[init.index - 1]?.postMessage(init);
      },
      terminate() {
        for (const worker of workers) worker.terminate();
      },
    };
  };
}

const helpers = helperPool();
const engine = createTypeScriptEngine(helpers === undefined ? {} : { helpers });

const handle = startWorkerHost(
  engine,
  (message: FromWorker) => {
    postMessage(message);
  },
  availableStorage(),
);

onmessage = (event: MessageEvent<ToWorker>) => {
  handle(event.data);
};
