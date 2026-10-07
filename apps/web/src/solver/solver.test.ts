import {
  applyAlgorithm,
  applyFaceTurns,
  isSolved,
  randomCube,
  SOLVED,
  Xoshiro128StarStar,
} from '@cube/core';
import type { FromWorker, ToWorker } from '@cube/solver-contracts';
import { createTypeScriptEngine } from '@cube/solver-ts';
import { describe, expect, it } from 'vitest';
import { SolverClient, type SolverStatus, type WorkerLike } from './client.ts';
import { toFaceTurns } from './useSolveSession.ts';
import { startWorkerHost, type TableStorage } from './worker-host.ts';

/**
 * A worker stand-in: the real host and engine, with messages delivered on later tasks in both
 * directions, as across a thread boundary.
 */
function inMemoryWorker(
  storage: TableStorage | null = null,
): WorkerLike & { readonly terminated: () => boolean } {
  let terminated = false;
  let handle: ((message: ToWorker) => void) | undefined;
  const inbox: ToWorker[] = [];
  const worker = {
    onmessage: null as WorkerLike['onmessage'],
    onerror: null as WorkerLike['onerror'],
    postMessage(message: ToWorker) {
      setTimeout(() => {
        if (terminated) return;
        if (handle === undefined) inbox.push(message);
        else handle(message);
      });
    },
    terminate() {
      terminated = true;
    },
    terminated: () => terminated,
  };
  const deliver = (message: FromWorker) => {
    setTimeout(() => {
      if (!terminated) worker.onmessage?.({ data: message } as MessageEvent<FromWorker>);
    });
  };
  setTimeout(() => {
    handle = startWorkerHost(createTypeScriptEngine(), deliver, storage);
    for (const message of inbox.splice(0)) handle(message);
  });
  return worker;
}

function whenReady(client: SolverClient): Promise<SolverStatus> {
  return new Promise((resolve) => {
    const check = () => {
      const status = client.getStatus();
      if (status.kind !== 'starting') {
        unsubscribe();
        resolve(status);
      }
    };
    const unsubscribe = client.subscribe(check);
    check();
  });
}

const cube = randomCube(Xoshiro128StarStar.fromSeed(11));

describe('solver client and worker host', { timeout: 30_000 }, () => {
  it('reports table building and becomes ready', async () => {
    const client = new SolverClient(inMemoryWorker, false);
    const steps: number[] = [];
    client.subscribe(() => {
      const status = client.getStatus();
      if (status.kind === 'starting') steps.push(status.done);
    });
    const status = await whenReady(client);
    expect(status.kind).toBe('ready');
    expect(status.kind === 'ready' && status.tableBytes).toBeGreaterThan(10_000_000);
    expect(steps.at(-1)).toBe(14);
    client.dispose();
  });

  it('solves a cube and reports each improvement', async () => {
    const client = new SolverClient(inMemoryWorker, false);
    const improvements: number[] = [];
    const { result } = client.solve(
      cube,
      { mode: 'fast', maxLength: 20, timeLimitMs: 5000 },
      { onImproved: (moves) => improvements.push(moves.length) },
    );
    const { moves, stoppedBy } = await result;
    expect(moves).not.toBeNull();
    expect(isSolved(applyFaceTurns(cube, toFaceTurns(moves ?? [])))).toBe(true);
    expect(stoppedBy).toBe('target');
    expect(improvements.at(-1)).toBe(moves?.length);
    client.dispose();
  });

  it('cancels through shared memory without replacing the worker', async () => {
    const workers: ReturnType<typeof inMemoryWorker>[] = [];
    const client = new SolverClient(() => {
      const worker = inMemoryWorker();
      workers.push(worker);
      return worker;
    }, true);
    const handle = client.solve(cube, { mode: 'fast', maxLength: 1, timeLimitMs: 60_000 });
    handle.cancel();
    expect((await handle.result).stoppedBy).toBe('cancelled');
    expect(workers).toHaveLength(1);
    client.dispose();
  });

  it('replaces the worker to cancel when memory cannot be shared', async () => {
    const workers: ReturnType<typeof inMemoryWorker>[] = [];
    const client = new SolverClient(() => {
      const worker = inMemoryWorker();
      workers.push(worker);
      return worker;
    }, false);
    await whenReady(client);
    const handle = client.solve(cube, { mode: 'fast', maxLength: 1, timeLimitMs: 60_000 });
    handle.cancel();
    expect(await handle.result).toEqual({
      moves: null,
      stoppedBy: 'cancelled',
      nodes: 0,
      elapsedMs: 0,
    });
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminated()).toBe(true);
    expect((await whenReady(client)).kind).toBe('ready');
    client.dispose();
  });

  it('builds the optimal table once, then loads it from storage and proves a solution', async () => {
    const files = new Map<string, Uint8Array>();
    const storage: TableStorage = {
      read: (name) => Promise.resolve(files.get(name) ?? null),
      write: (name, bytes) => {
        files.set(name, bytes);
        return Promise.resolve();
      },
    };
    const first = new SolverClient(() => inMemoryWorker(storage), true);
    const built = await first.prepare('standard').result;
    expect(built?.source).toBe('built');
    expect(files.get('optimal-standard.bin')?.byteLength).toBe(35_227_136);
    first.dispose();

    const second = new SolverClient(() => inMemoryWorker(storage), true);
    expect((await second.prepare('standard').result)?.source).toBe('cache');
    expect(second.getOptimalStatus().kind).toBe('ready');
    const scrambled = applyAlgorithm(SOLVED, "R U2 F' L D2 B");
    if (!scrambled.ok) throw new Error('bad scramble');
    const result = await second.solve(scrambled.value, { mode: 'optimal', tier: 'standard' })
      .result;
    expect(result.stoppedBy).toBe('proven');
    expect(result.moves?.length).toBeLessThanOrEqual(6);
    expect(isSolved(applyFaceTurns(scrambled.value, toFaceTurns(result.moves ?? [])))).toBe(true);
    second.dispose();
  }, 180_000);
});
