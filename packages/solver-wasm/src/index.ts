import type { CubieCube } from '@cube/core';
import type { SolveHooks, SolveResult, SolverEngine, StopReason } from '@cube/solver-contracts';
import init, {
  Engine,
  engineVersion,
  type InitInput,
  type SearchCallbacks,
} from '../pkg/solver.js';

/** As in the TypeScript engine: how long the two-phase solver may look for an upper bound. */
const UPPER_BOUND_MS = 1000;

const STOP_REASONS: readonly StopReason[] = ['proven', 'target', 'time', 'cancelled', 'exhausted'];

function stopReason(value: string): StopReason {
  const reason = STOP_REASONS.find((r) => r === value);
  if (reason === undefined) throw new Error(`Unknown stop reason ${value}`);
  return reason;
}

const cubeBytes = (cube: CubieCube) =>
  Uint8Array.from([...cube.cp, ...cube.co, ...cube.ep, ...cube.eo]);

export interface WasmEngine extends SolverEngine {
  readonly version: string;
}

/**
 * The Rust solvers behind the engine-neutral worker protocol. The caller supplies the module
 * bytes or URL: the browser passes a bundler asset URL, Node tests pass the file contents, so this
 * package stays free of environment checks.
 */
export async function createWasmEngine(module: InitInput): Promise<WasmEngine> {
  const { memory } = await init({ module_or_path: module });
  const engine = new Engine();
  // The buffer last handed out for a saved file; it lives in the module's memory.
  let staged: Uint8Array | null = null;

  function callbacks(hooks: SolveHooks, begin: number, known: number | null): SearchCallbacks {
    return {
      now: () => performance.now(),
      shouldStop: hooks.shouldStop,
      onProgress: (depth, best, nodes) => {
        hooks.onProgress({
          depth,
          bestLength: best >= 0 ? best : known,
          nodes,
          elapsedMs: performance.now() - begin,
        });
      },
      onImprovement: (moves) => {
        hooks.onImprovement(Array.from(moves));
      },
    };
  }

  function solveOptimal(cube: CubieCube, hooks: SolveHooks): SolveResult {
    const begin = performance.now();
    const bytes = cubeBytes(cube);
    // Reaching the lower bound proves the quick solution optimal, so stop there.
    const quick = engine.solveFast(
      bytes,
      engine.lowerBound(bytes),
      UPPER_BOUND_MS,
      callbacks(hooks, begin, null),
    );
    const known = quick.moves;
    const quickNodes = quick.nodes;
    quick.free();
    const result = engine.solveOptimal(
      bytes,
      known ?? new Uint8Array(),
      callbacks(hooks, begin, known?.length ?? null),
    );
    const moves = result.moves ?? known;
    const stoppedBy = stopReason(result.stoppedBy);
    if (result.moves !== undefined && stoppedBy === 'proven') {
      hooks.onImprovement(Array.from(result.moves));
    }
    const nodes = quickNodes + result.nodes;
    result.free();
    return {
      moves: moves === undefined ? null : Array.from(moves),
      stoppedBy,
      nodes,
      elapsedMs: performance.now() - begin,
    };
  }

  return {
    name: 'WebAssembly',
    version: engineVersion(),
    init(onProgress) {
      const tableBytes = engine.init({
        onProgress: (done, total) => {
          onProgress(done, total);
          return true;
        },
      });
      return { tableBytes };
    },
    allocateTableFile(size) {
      // Allocating may grow the memory, which detaches the old buffer: take the buffer after.
      const address = engine.allocateTableFile(size);
      staged = new Uint8Array(memory.buffer, address, size);
      return staged;
    },
    prepareOptimal(tier, saved, hooks) {
      // A file from elsewhere is copied in; one read into our buffer is used where it is.
      let useStaged = saved !== null && saved === staged;
      if (saved !== null && !useStaged) {
        const address = engine.allocateTableFile(saved.byteLength);
        new Uint8Array(memory.buffer, address, saved.byteLength).set(saved);
        useStaged = true;
      }
      staged = null;
      const bytes = engine.prepareOptimal(tier === 'huge', useStaged, {
        onProgress: (done, total) => {
          hooks.onProgress(done, total);
          return !hooks.shouldStop();
        },
      });
      if (bytes < 0) return null;
      // Read the address after the build: memory may have grown and moved the buffer.
      const file = new Uint8Array(
        memory.buffer,
        engine.tableFileAddress(),
        engine.tableFileBytes(),
      );
      return { tableBytes: bytes, file, restored: engine.restored };
    },
    solve(cube, options, hooks) {
      if (options.mode === 'optimal') return solveOptimal(cube, hooks);
      const begin = performance.now();
      const outcome = engine.solveFast(
        cubeBytes(cube),
        options.maxLength,
        options.timeLimitMs,
        callbacks(hooks, begin, null),
      );
      const result: SolveResult = {
        moves: outcome.moves === undefined ? null : Array.from(outcome.moves),
        stoppedBy: stopReason(outcome.stoppedBy),
        nodes: outcome.nodes,
        elapsedMs: performance.now() - begin,
      };
      outcome.free();
      return result;
    },
  };
}

export { engineVersion };
