import { applyFaceTurns, inverseTurns, SOLVED, type CubieCube, type FaceTurn } from '@cube/core';

/**
 * Playback of a move sequence from a start state. `position` counts the moves already applied;
 * while a move animates, `position` still describes the state before it lands.
 */
export interface Playback {
  readonly start: CubieCube;
  readonly moves: readonly FaceTurn[];
  readonly position: number;
  readonly animating: { readonly turn: FaceTurn; readonly forward: boolean } | null;
  readonly playing: boolean;
}

export type PlaybackAction =
  | { readonly type: 'load'; readonly start: CubieCube; readonly moves: readonly FaceTurn[] }
  | { readonly type: 'step'; readonly forward: boolean }
  | { readonly type: 'seek'; readonly position: number }
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  | { readonly type: 'toggle' }
  | { readonly type: 'animation-done' };

export const INITIAL_PLAYBACK: Playback = {
  start: SOLVED,
  moves: [],
  position: 0,
  animating: null,
  playing: false,
};

function animateForward(state: Playback): Playback {
  const turn = state.moves[state.position];
  return turn === undefined
    ? { ...state, playing: false }
    : { ...state, animating: { turn, forward: true } };
}

export function playbackReducer(state: Playback, action: PlaybackAction): Playback {
  switch (action.type) {
    case 'load':
      return { ...INITIAL_PLAYBACK, start: action.start, moves: action.moves };
    case 'step': {
      if (state.animating !== null) return state;
      if (action.forward) return animateForward({ ...state, playing: false });
      const turn = state.moves[state.position - 1];
      return turn === undefined
        ? state
        : { ...state, playing: false, animating: { turn, forward: false } };
    }
    case 'seek':
      return {
        ...state,
        position: Math.max(0, Math.min(action.position, state.moves.length)),
        animating: null,
        playing: false,
      };
    case 'play': {
      if (state.moves.length === 0) return state;
      const from = state.position >= state.moves.length ? { ...state, position: 0 } : state;
      return from.animating === null
        ? animateForward({ ...from, playing: true })
        : { ...from, playing: true };
    }
    case 'pause':
      return { ...state, playing: false };
    case 'toggle':
      return playbackReducer(state, { type: state.playing ? 'pause' : 'play' });
    case 'animation-done': {
      if (state.animating === null) return state;
      const position = state.position + (state.animating.forward ? 1 : -1);
      const landed = { ...state, position, animating: null };
      return state.playing ? animateForward(landed) : landed;
    }
  }
}

/** The state shown when no move is animating: the start with the first `position` moves applied. */
export function cubeAt(start: CubieCube, moves: readonly FaceTurn[], position: number): CubieCube {
  return applyFaceTurns(start, moves.slice(0, position));
}

/** The turn to animate, as seen from the current state: undoing a move turns the other way. */
export function visibleTurn(animating: NonNullable<Playback['animating']>): FaceTurn {
  const { turn, forward } = animating;
  return forward ? turn : { face: turn.face, turns: inverseTurns(turn.turns) };
}
