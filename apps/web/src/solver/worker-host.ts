import {
  CANCEL_FLAG,
  type FromWorker,
  type SolverEngine,
  type ToWorker,
} from '@cube/solver-contracts';

const PROGRESS_INTERVAL_MS = 100;

/**
 * Builds the engine's tables right away, reporting progress, and returns the handler for
 * incoming requests. Requests that arrive while the tables are being built simply wait in the
 * worker's message queue.
 */
export function startWorkerHost(
  engine: SolverEngine,
  post: (message: FromWorker) => void,
): (message: ToWorker) => void {
  let ready = false;
  try {
    const start = performance.now();
    const { tableBytes } = engine.init((done, total) => {
      post({ type: 'init-progress', done, total });
    });
    post({ type: 'ready', initMs: performance.now() - start, tableBytes });
    ready = true;
  } catch (error) {
    post({ type: 'error', id: null, message: String(error) });
  }

  return (message) => {
    const { id } = message;
    if (!ready) {
      post({ type: 'error', id, message: 'The solver tables are not available' });
      return;
    }
    const flag = message.cancelFlag === undefined ? undefined : new Int32Array(message.cancelFlag);
    let lastProgress = Number.NEGATIVE_INFINITY;
    try {
      const result = engine.solve(message.cube, message.options, {
        shouldStop: () => flag !== undefined && Atomics.load(flag, CANCEL_FLAG) === 1,
        onProgress: (progress) => {
          const now = performance.now();
          if (now - lastProgress < PROGRESS_INTERVAL_MS) return;
          lastProgress = now;
          post({ type: 'progress', id, progress });
        },
        onImprovement: (moves) => {
          post({ type: 'improved', id, moves });
        },
      });
      post({ type: 'result', id, result });
    } catch (error) {
      post({ type: 'error', id, message: String(error) });
    }
  };
}
