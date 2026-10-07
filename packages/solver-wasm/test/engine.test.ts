import {
  applyFaceTurns,
  FACE_TURNS,
  faceTurnIndex,
  isSolved,
  randomCube,
  SOLVED,
  Xoshiro128StarStar,
  type CubieCube,
  type FaceTurn,
} from '@cube/core';
import type { SolveHooks } from '@cube/solver-contracts';
import {
  axisDistances,
  buildOptimalTables,
  buildTwoPhaseTables,
  createOptimalSolver,
  createTypeScriptEngine,
  type OptimalTables,
} from '@cube/solver-ts';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { Engine, type SearchCallbacks } from '../pkg/solver.js';
import { createWasmEngine, type WasmEngine } from '../src/index.ts';

const quiet: SolveHooks = {
  shouldStop: () => false,
  onProgress: () => undefined,
  onImprovement: () => undefined,
};

const turns = (indices: readonly number[]): FaceTurn[] =>
  indices.map((i) => {
    const turn = FACE_TURNS[i];
    if (turn === undefined) throw new Error(`No move ${String(i)}`);
    return turn;
  });

/** Index of the first differing byte, or -1; deep equality on 35 MB would exhaust the heap. */
function firstDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

const bytes = (cube: CubieCube) =>
  Uint8Array.from([...cube.cp, ...cube.co, ...cube.ep, ...cube.eo]);

let wasm: WasmEngine;
let tsTables: OptimalTables;

beforeAll(async () => {
  wasm = await createWasmEngine(await readFile(new URL('../pkg/solver_bg.wasm', import.meta.url)));
  wasm.init(() => undefined);
  const built = buildOptimalTables('standard', buildTwoPhaseTables());
  if (built === null) throw new Error('not built');
  tsTables = built;
}, 120_000);

describe('WebAssembly engine', { timeout: 120_000 }, () => {
  it('reports the crate version', () => {
    expect(wasm.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('builds fast tables of the same size as the TypeScript engine', () => {
    const ts = createTypeScriptEngine();
    expect(wasm.init(() => undefined).tableBytes).toBe(ts.init(() => undefined).tableBytes);
  });

  it('solves random cubes in fast mode', () => {
    const rng = Xoshiro128StarStar.fromSeed(3n);
    for (let i = 0; i < 10; i++) {
      const cube = randomCube(rng);
      const result = wasm.solve(cube, { mode: 'fast', maxLength: 21, timeLimitMs: 10_000 }, quiet);
      expect(result.moves).not.toBeNull();
      expect(result.moves?.length).toBeLessThanOrEqual(21);
      expect(isSolved(applyFaceTurns(cube, turns(result.moves ?? [])))).toBe(true);
    }
  });

  it('builds a byte-identical optimal table and restores it from those bytes', () => {
    const hooks = { onProgress: () => undefined, shouldStop: () => false };
    const prepared = wasm.prepareOptimal('standard', null, hooks);
    expect(prepared?.restored).toBe(false);
    expect(firstDifference(prepared?.file ?? new Uint8Array(), tsTables.file)).toBe(-1);

    // A file written by the TypeScript engine, read straight into WebAssembly memory.
    const target = wasm.allocateTableFile(tsTables.file.byteLength);
    target.set(tsTables.file);
    expect(wasm.prepareOptimal('standard', target, hooks)?.restored).toBe(true);
  });

  it('computes the same exact distances and the same optimal search as TypeScript', () => {
    const raw = new Engine();
    raw.init({ onProgress: () => true });
    raw.prepareOptimal(false, false, { onProgress: () => true });
    const solveTs = createOptimalSolver(tsTables);
    const callbacks: SearchCallbacks = {
      now: () => performance.now(),
      shouldStop: () => false,
      onProgress: () => undefined,
      onImprovement: () => undefined,
    };
    const rng = Xoshiro128StarStar.fromSeed(9n);
    for (let i = 0; i < 6; i++) {
      const cube = randomCube(rng);
      expect(Array.from(raw.axisDistances(bytes(cube)))).toEqual(axisDistances(tsTables, cube));
    }
    for (let i = 0; i < 6; i++) {
      const scramble = Array.from({ length: 8 + i }, (_, k) => FACE_TURNS[(k * 5 + i) % 18]);
      const cube = applyFaceTurns(SOLVED, turns(scramble.map((t) => (t ? faceTurnIndex(t) : 0))));
      const ts = solveTs(cube);
      const outcome = raw.solveOptimal(bytes(cube), new Uint8Array(), callbacks);
      expect(Array.from(outcome.moves ?? [])).toEqual(ts.moves?.map(faceTurnIndex));
      expect(outcome.nodes).toBe(ts.nodes);
      outcome.free();
    }
    raw.free();
  });

  it('proves an optimal solution through the engine interface', () => {
    const cube = applyFaceTurns(SOLVED, turns([3, 0, 8, 13, 9, 17, 4]));
    const result = wasm.solve(cube, { mode: 'optimal', tier: 'standard' }, quiet);
    expect(result.stoppedBy).toBe('proven');
    expect(isSolved(applyFaceTurns(cube, turns(result.moves ?? [])))).toBe(true);
    expect(result.moves?.length).toBeLessThanOrEqual(7);
  });
});
