import { randomCube, randomCube4, Xoshiro128StarStar } from '@cube/core';
import type { Handle } from '../solver/client.ts';
import { getFourClient, getSolverClient } from '../solver/solver.ts';

/** The recorded runs' seed: the first cubes here are the first cubes there. */
const SEED = 1;

export interface Sample {
  readonly length: number;
  readonly ms: number;
}

export interface RunSummary {
  readonly count: number;
  readonly meanLength: number;
  readonly medianMs: number;
  readonly maxMs: number;
}

export function summarise(samples: readonly Sample[]): RunSummary {
  const times = samples.map((s) => s.ms).sort((a, b) => a - b);
  const middle = times.length / 2;
  const median =
    times.length % 2 === 1
      ? (times[Math.floor(middle)] ?? 0)
      : ((times[middle - 1] ?? 0) + (times[middle] ?? 0)) / 2;
  return {
    count: samples.length,
    meanLength: samples.reduce((s, x) => s + x.length, 0) / samples.length,
    medianMs: median,
    maxMs: times.at(-1) ?? 0,
  };
}

/**
 * Solves `count` seeded random cubes one after another in the page's solver worker, with the
 * recorded runs' settings: fast mode stopping at 20 moves for the 3×3×3, the default reduction
 * for the 4×4×4. Times are the worker's own, without messaging. The result is null if cancelled.
 */
export function runBenchmark(
  puzzle: 3 | 4,
  count: number,
  onProgress: (done: number) => void,
): Handle<RunSummary | null> {
  let current: Handle<{
    readonly moves: readonly number[] | null;
    readonly elapsedMs: number;
  }> | null = null;
  // An object, so the loop sees the flag set by cancel() after an await.
  const stop = { requested: false };
  const rng = Xoshiro128StarStar.fromSeed(SEED);
  const result = (async () => {
    const samples: Sample[] = [];
    for (let i = 0; i < count; i++) {
      current =
        puzzle === 3
          ? getSolverClient().solve(randomCube(rng), {
              mode: 'fast',
              maxLength: 20,
              timeLimitMs: 10_000,
            })
          : getFourClient().solveFour(randomCube4(rng));
      const { moves, elapsedMs } = await current.result;
      if (stop.requested || moves === null) return null;
      samples.push({ length: moves.length, ms: elapsedMs });
      onProgress(i + 1);
    }
    return summarise(samples);
  })();
  return {
    result,
    cancel: () => {
      stop.requested = true;
      current?.cancel();
    },
  };
}
