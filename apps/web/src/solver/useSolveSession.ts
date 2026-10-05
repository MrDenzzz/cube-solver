import {
  FACE_TURNS,
  formatFaceTurns,
  invertFaceTurns,
  randomCube,
  Xoshiro128StarStar,
  type CubieCube,
  type FaceTurn,
} from '@cube/core';
import type { SolveOptions, SolveProgress, SolveResult } from '@cube/solver-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SolveHandle } from './client.ts';
import { getSolverClient } from './solver.ts';

export type SolveSession =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'solving';
      readonly progress: SolveProgress | null;
      readonly bestLength: number | null;
    }
  | {
      readonly kind: 'done';
      readonly result: SolveResult;
      readonly moves: readonly FaceTurn[] | null;
    }
  | { readonly kind: 'error'; readonly message: string };

export function toFaceTurns(indices: readonly number[]): FaceTurn[] {
  return indices.map((index) => {
    const turn = FACE_TURNS[index];
    if (turn === undefined) throw new RangeError(`Move index ${String(index)} is out of range`);
    return turn;
  });
}

/**
 * One solve at a time. Starting a new one or resetting cancels the previous search, and answers
 * from a superseded search are ignored.
 */
export function useSolveSession(onSolved: (cube: CubieCube, moves: readonly FaceTurn[]) => void) {
  const [session, setSession] = useState<SolveSession>({ kind: 'idle' });
  const current = useRef<SolveHandle | null>(null);

  const cancel = useCallback(() => {
    current.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    current.current?.cancel();
    current.current = null;
    setSession({ kind: 'idle' });
  }, []);

  const solve = useCallback(
    (cube: CubieCube, options: SolveOptions) => {
      current.current?.cancel();
      const handle: SolveHandle = getSolverClient().solve(cube, options, {
        onProgress: (progress) => {
          if (current.current !== handle) return;
          setSession((s) => (s.kind === 'solving' ? { ...s, progress } : s));
        },
        onImproved: (moves) => {
          if (current.current !== handle) return;
          setSession((s) => (s.kind === 'solving' ? { ...s, bestLength: moves.length } : s));
        },
      });
      current.current = handle;
      setSession({ kind: 'solving', progress: null, bestLength: null });
      handle.result.then(
        (result) => {
          if (current.current !== handle) return;
          current.current = null;
          const moves = result.moves === null ? null : toFaceTurns(result.moves);
          setSession({ kind: 'done', result, moves });
          if (moves !== null) onSolved(cube, moves);
        },
        (error: unknown) => {
          if (current.current !== handle) return;
          current.current = null;
          setSession({ kind: 'error', message: String(error) });
        },
      );
    },
    [onSolved],
  );

  useEffect(
    () => () => {
      current.current?.cancel();
    },
    [],
  );

  return { session, solve, cancel, reset };
}

/**
 * A random-state scramble, the way WCA scramblers make them: draw a uniformly random reachable
 * state, solve it, and read the solution backwards.
 */
export async function randomScramble(): Promise<string> {
  const [high = 0, low = 0] = crypto.getRandomValues(new Uint32Array(2));
  const rng = Xoshiro128StarStar.fromSeed((BigInt(high) << 32n) | BigInt(low));
  const cube = randomCube(rng);
  const { moves } = await getSolverClient().solve(cube, { maxLength: 21, timeLimitMs: 1000 })
    .result;
  if (moves === null) throw new Error('The scramble search was cancelled');
  return formatFaceTurns(invertFaceTurns(toFaceTurns(moves)));
}
