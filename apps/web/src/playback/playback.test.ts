import { applyAlgorithm, SOLVED, SOLVED_FACELETS, toFacelets, type LayerTurn } from '@cube/core';
import { describe, expect, it } from 'vitest';
import {
  faceletsAt,
  INITIAL_PLAYBACK,
  nextMove,
  playbackReducer,
  type Playback,
  type PlaybackAction,
} from './playback.ts';

const R: LayerTurn = { face: 'R', from: 1, to: 1, turns: 1 };
const U2: LayerTurn = { face: 'U', from: 1, to: 1, turns: 2 };
const F3: LayerTurn = { face: 'F', from: 1, to: 1, turns: 3 };

const run = (state: Playback, ...actions: PlaybackAction[]) =>
  actions.reduce(playbackReducer, state);
const loaded = run(INITIAL_PLAYBACK, {
  type: 'load',
  size: 3,
  start: SOLVED_FACELETS,
  moves: [R, U2, F3],
});

function after(algorithm: string): string {
  const result = applyAlgorithm(SOLVED, algorithm);
  if (!result.ok) throw new Error(algorithm);
  return toFacelets(result.value);
}

describe('playback', () => {
  it('animates one move per step and lands on the next state', () => {
    const stepping = run(loaded, { type: 'step', forward: true });
    expect(stepping.animating).toEqual({ turn: R, forward: true });
    expect(stepping.position).toBe(0);
    const landed = run(stepping, { type: 'animation-done' });
    expect(landed.position).toBe(1);
    expect(faceletsAt(landed)).toBe(after('R'));
    expect(nextMove(landed)).toEqual(U2);
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
    expect(faceletsAt(state)).toBe(after("R U2 F'"));
    expect(nextMove(state)).toBeNull();
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
