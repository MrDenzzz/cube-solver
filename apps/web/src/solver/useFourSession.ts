import {
  formatAlgorithm,
  inverseTurns,
  MOVES_4,
  randomCube4,
  toMove,
  Xoshiro128StarStar,
  type Cube4,
  type LayerTurn,
} from '@cube/core';
import type { FourResult } from '@cube/solver-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Handle } from './client.ts';
import { getFourClient } from './solver.ts';

export type FourSession =
  | { readonly kind: 'idle' }
  | { readonly kind: 'solving' }
  | {
      readonly kind: 'done';
      readonly result: FourResult;
      readonly moves: readonly LayerTurn[] | null;
    }
  | { readonly kind: 'error'; readonly message: string };

export function toLayerTurns4(indices: readonly number[]): LayerTurn[] {
  return indices.map((index) => {
    const turn = MOVES_4[index];
    if (turn === undefined) throw new RangeError(`Move index ${String(index)} is out of range`);
    return turn;
  });
}

/** One 4×4×4 solve at a time, like useSolveSession for the 3×3×3. */
export function useFourSession(onSolved: (cube: Cube4, moves: readonly LayerTurn[]) => void) {
  const [session, setSession] = useState<FourSession>({ kind: 'idle' });
  const current = useRef<Handle<FourResult> | null>(null);

  const cancel = useCallback(() => {
    current.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    current.current?.cancel();
    current.current = null;
    setSession({ kind: 'idle' });
  }, []);

  const solve = useCallback(
    (cube: Cube4) => {
      current.current?.cancel();
      const handle = getFourClient().solveFour(cube);
      current.current = handle;
      setSession({ kind: 'solving' });
      handle.result.then(
        (result) => {
          if (current.current !== handle) return;
          current.current = null;
          const moves = result.moves === null ? null : toLayerTurns4(result.moves);
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

/** A random-state 4×4×4 scramble: a uniformly random state's solution, read backwards. */
export async function randomScramble4(): Promise<string> {
  const [high = 0, low = 0] = crypto.getRandomValues(new Uint32Array(2));
  const rng = Xoshiro128StarStar.fromSeed((BigInt(high) << 32n) | BigInt(low));
  const { moves } = await getFourClient().solveFour(randomCube4(rng)).result;
  if (moves === null) throw new Error('The scramble search was cancelled');
  const inverse = toLayerTurns4(moves)
    .reverse()
    .map((turn) => toMove({ ...turn, turns: inverseTurns(turn.turns) }, 4));
  return formatAlgorithm(inverse);
}
