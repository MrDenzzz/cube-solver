import type { FromWorker, ToWorker } from '@cube/solver-contracts';
import { createWasmEngine } from '@cube/solver-wasm';
import wasmUrl from '@cube/solver-wasm/solver.wasm?url';
import { availableStorage } from './opfs-storage.ts';
import { startWorkerHost } from './worker-host.ts';

// The Rust engine. Loading the module is asynchronous, so requests that arrive first wait here;
// the TypeScript engine's worker needs no such queue.

const post = (message: FromWorker) => {
  postMessage(message);
};
const waiting: ToWorker[] = [];
let handle: ((message: ToWorker) => void) | undefined;

onmessage = (event: MessageEvent<ToWorker>) => {
  if (handle === undefined) waiting.push(event.data);
  else handle(event.data);
};

createWasmEngine(wasmUrl).then(
  (engine) => {
    const ready = startWorkerHost(engine, post, availableStorage());
    handle = ready;
    for (const message of waiting.splice(0)) ready(message);
  },
  (error: unknown) => {
    post({ type: 'error', id: null, message: `WebAssembly failed to load: ${String(error)}` });
  },
);
