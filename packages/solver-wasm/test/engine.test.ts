import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadWasmEngine } from '../src/index.ts';

describe('loadWasmEngine', () => {
  it('instantiates the module and reports the crate version', async () => {
    const bytes = await readFile(new URL('../pkg/solver_bg.wasm', import.meta.url));
    const engine = await loadWasmEngine(bytes);
    expect(engine.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
