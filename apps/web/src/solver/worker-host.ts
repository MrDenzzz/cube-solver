import {
  CANCEL_FLAG,
  type FourSolver,
  type FromWorker,
  type PrepareRequest,
  type SolverEngine,
  type ToWorker,
} from '@cube/solver-contracts';

const PROGRESS_INTERVAL_MS = 100;

/** Where built tables are kept between visits. Failures only cost a rebuild. */
export interface TableStorage {
  /** Reads a file into a buffer from `allocate`, or returns null if there is none. */
  read(name: string, allocate: (size: number) => Uint8Array): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
}

/** Posts at most one progress message per interval. */
function throttled<A extends unknown[]>(send: (...args: A) => void): (...args: A) => void {
  let last = Number.NEGATIVE_INFINITY;
  return (...args) => {
    const now = performance.now();
    if (now - last < PROGRESS_INTERVAL_MS) return;
    last = now;
    send(...args);
  };
}

/**
 * Builds the engine's fast tables right away, reporting progress, and returns the handler for
 * incoming requests. Requests that arrive while the tables are being built simply wait in the
 * worker's message queue.
 */
export function startWorkerHost(
  engine: SolverEngine,
  post: (message: FromWorker) => void,
  storage: TableStorage | null = null,
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

  async function prepare({ id, tier }: PrepareRequest, shouldStop: () => boolean) {
    const start = performance.now();
    // The file format version lives in the header, so one name per tier is enough.
    const name = `optimal-${tier}.bin`;
    let saved: Uint8Array | null = null;
    try {
      saved = (await storage?.read(name, (size) => engine.allocateTableFile(size))) ?? null;
    } catch {
      // Unreadable storage is the same as an empty one.
    }
    const prepared = engine.prepareOptimal(tier, saved, {
      onProgress: throttled((done: number, total: number) => {
        post({ type: 'prepare-progress', id, done, total });
      }),
      shouldStop,
    });
    if (prepared === null) {
      post({ type: 'prepared', id, report: null });
      return;
    }
    let cacheError: string | null = null;
    if (!prepared.restored && storage !== null) {
      try {
        await storage.write(name, prepared.file);
      } catch (error) {
        cacheError = String(error);
      }
    }
    post({
      type: 'prepared',
      id,
      report: {
        tier,
        source: prepared.restored ? 'cache' : 'built',
        tableBytes: prepared.tableBytes,
        ms: performance.now() - start,
        cacheError,
      },
    });
  }

  /** The 4×4×4 tables, built on first use; null when the engine has no 4×4×4 solver. */
  function prepareFour(id: number): FourSolver | null {
    const { four } = engine;
    if (four === undefined) {
      post({ type: 'error', id, message: `The ${engine.name} engine has no 4×4×4 solver` });
      return null;
    }
    const start = performance.now();
    const { tableBytes } = four.prepare(
      throttled((done: number, total: number) => {
        post({ type: 'four-progress', id, done, total });
      }),
    );
    post({ type: 'four-ready', id, tableBytes, ms: performance.now() - start });
    return four;
  }

  return (message) => {
    const { id } = message;
    if (!ready) {
      post({ type: 'error', id, message: 'The solver tables are not available' });
      return;
    }
    if (message.type === 'prepare-four') {
      try {
        prepareFour(id);
      } catch (error) {
        post({ type: 'error', id, message: String(error) });
      }
      return;
    }
    const flag = message.cancelFlag === undefined ? undefined : new Int32Array(message.cancelFlag);
    const shouldStop = () => flag !== undefined && Atomics.load(flag, CANCEL_FLAG) === 1;
    if (message.type === 'prepare') {
      prepare(message, shouldStop).catch((error: unknown) => {
        post({ type: 'error', id, message: String(error) });
      });
      return;
    }
    if (message.type === 'solve-four') {
      try {
        const four = prepareFour(id);
        if (four !== null)
          post({ type: 'four-result', id, result: four.solve(message.cube, shouldStop) });
      } catch (error) {
        post({ type: 'error', id, message: String(error) });
      }
      return;
    }
    try {
      const result = engine.solve(message.cube, message.options, {
        shouldStop,
        onProgress: throttled((progress) => {
          post({ type: 'progress', id, progress });
        }),
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
