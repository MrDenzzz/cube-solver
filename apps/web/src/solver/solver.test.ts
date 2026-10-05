import { applyFaceTurns, isSolved, randomCube, Xoshiro128StarStar } from '@cube/core';
import type { FromWorker, ToWorker } from '@cube/solver-contracts';
import { createTwoPhaseEngine } from '@cube/solver-ts';
import { describe, expect, it } from 'vitest';
import { SolverClient, type SolverStatus, type WorkerLike } from './client.ts';
import { toFaceTurns } from './useSolveSession.ts';
import { startWorkerHost } from './worker-host.ts';

/**
 * A worker stand-in: the real host and engine, with messages delivered on later tasks in both
 * directions, as across a thread boundary.
 */
function inMemoryWorker(): WorkerLike & { readonly terminated: () => boolean } {
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
    handle = startWorkerHost(createTwoPhaseEngine(), deliver);
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
      { maxLength: 20, timeLimitMs: 5000 },
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
    const handle = client.solve(cube, { maxLength: 1, timeLimitMs: 60_000 });
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
    const handle = client.solve(cube, { maxLength: 1, timeLimitMs: 60_000 });
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
});
