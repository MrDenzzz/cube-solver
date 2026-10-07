import { runHelper, type HelperInit } from '@cube/solver-ts';
import { parentPort } from 'node:worker_threads';

parentPort?.on('message', (init: HelperInit) => {
  runHelper(init);
});
