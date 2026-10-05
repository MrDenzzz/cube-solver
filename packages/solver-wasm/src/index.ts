import init, { engineVersion, type InitInput } from '../pkg/solver.js';

export interface WasmEngine {
  readonly version: string;
}

/**
 * The caller supplies the module bytes or URL: the browser passes a bundler asset URL,
 * Node tests pass the file contents, so this package stays free of environment checks.
 */
export async function loadWasmEngine(module: InitInput): Promise<WasmEngine> {
  await init({ module_or_path: module });
  return { version: engineVersion() };
}
