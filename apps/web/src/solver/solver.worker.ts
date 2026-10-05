import type { FromWorker, ToWorker } from '@cube/solver-contracts';
import { createTwoPhaseEngine } from '@cube/solver-ts';
import { startWorkerHost } from './worker-host.ts';

const handle = startWorkerHost(createTwoPhaseEngine(), (message: FromWorker) => {
  postMessage(message);
});

onmessage = (event: MessageEvent<ToWorker>) => {
  handle(event.data);
};
