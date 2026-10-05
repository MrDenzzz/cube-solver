import { applyAlgorithm, equals, SOLVED, type CubieCube, type FaceTurn } from '@cube/core';
import { describe, expect, it } from 'vitest';
import {
  cubeAt,
  INITIAL_PLAYBACK,
  playbackReducer,
  type Playback,
  type PlaybackAction,
} from './playback.ts';

const R: FaceTurn = { face: 'R', turns: 1 };
const U2: FaceTurn = { face: 'U', turns: 2 };
const F3: FaceTurn = { face: 'F', turns: 3 };

const run = (state: Playback, ...actions: PlaybackAction[]) =>
  actions.reduce(playbackReducer, state);
const loaded = run(INITIAL_PLAYBACK, { type: 'load', start: SOLVED, moves: [R, U2, F3] });

function after(algorithm: string): CubieCube {
  const result = applyAlgorithm(SOLVED, algorithm);
  if (!result.ok) throw new Error(algorithm);
  return result.value;
}

describe('playback', () => {
  it('animates one move per step and lands on the next state', () => {
    const stepping = run(loaded, { type: 'step', forward: true });
    expect(stepping.animating).toEqual({ turn: R, forward: true });
    expect(stepping.position).toBe(0);
    const landed = run(stepping, { type: 'animation-done' });
    expect(landed.position).toBe(1);
    expect(equals(cubeAt(landed.start, landed.moves, landed.position), after('R'))).toBe(true);
  });

  it('ignores steps while a move is animating', () => {
    const stepping = run(loaded, { type: 'step', forward: true });
    expect(run(stepping, { type: 'step', forward: true })).toBe(stepping);
  });

  it('steps back by undoing the previous move', () => {
    const state = run(loaded, { type: 'seek', position: 2 }, { type: 'step', forward: false });
    expect(state.animating).toEqual({ turn: U2, forward: false });
    expect(run(state, { type: 'animation-done' }).position).toBe(1);
  });

  it('plays through to the end and stops', () => {
    let state = run(loaded, { type: 'play' });
    for (let i = 0; i < 3; i++) state = run(state, { type: 'animation-done' });
    expect(state.position).toBe(3);
    expect(state.playing).toBe(false);
    expect(state.animating).toBeNull();
    expect(equals(cubeAt(state.start, state.moves, state.position), after("R U2 F'"))).toBe(true);
  });

  it('restarts from the scramble when played at the end', () => {
    const state = run(loaded, { type: 'seek', position: 3 }, { type: 'play' });
    expect(state.position).toBe(0);
    expect(state.animating?.turn).toEqual(R);
  });

  it('lets the current move finish after a pause', () => {
    const state = run(loaded, { type: 'play' }, { type: 'pause' }, { type: 'animation-done' });
    expect(state.position).toBe(1);
    expect(state.animating).toBeNull();
  });

  it('toggles between playing and paused', () => {
    const playing = run(loaded, { type: 'toggle' });
    expect(playing.playing).toBe(true);
    expect(run(playing, { type: 'toggle' }).playing).toBe(false);
  });

  it('clamps seeks to the sequence', () => {
    expect(run(loaded, { type: 'seek', position: 99 }).position).toBe(3);
    expect(run(loaded, { type: 'seek', position: -4 }).position).toBe(0);
  });
});
