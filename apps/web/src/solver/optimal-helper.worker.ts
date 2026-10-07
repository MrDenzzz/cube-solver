import { runHelper, type HelperInit } from '@cube/solver-ts';

// One helper of the parallel optimal search. While a solver uses it, it blocks in Atomics.wait
// between search depths; when that solver is disposed it returns here for the next one.
onmessage = (event: MessageEvent<HelperInit>) => {
  runHelper(event.data);
};
