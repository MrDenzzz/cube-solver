import type { FromWorker, ToWorker } from '@cube/solver-contracts';
import { createTypeScriptEngine } from '@cube/solver-ts';
import { availableStorage } from './opfs-storage.ts';
import { startWorkerHost } from './worker-host.ts';

const handle = startWorkerHost(
  createTypeScriptEngine(),
  (message: FromWorker) => {
    postMessage(message);
  },
  availableStorage(),
);

onmessage = (event: MessageEvent<ToWorker>) => {
  handle(event.data);
};
