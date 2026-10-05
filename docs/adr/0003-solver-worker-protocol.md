# 0003. Solver worker: protocol, progress and cancellation

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

- Searches take from milliseconds to seconds (fast mode) and up to minutes (optimal mode, step 6),
  so they run in a Web Worker and the page stays responsive.
- The search is a synchronous loop. While it runs, the worker does not read its message queue: a
  `cancel` message would only arrive after the search has finished on its own.
- Two engines, TypeScript and WebAssembly (step 6), must be interchangeable behind one worker.
- Building the fast-mode tables takes about half a second; the optimal-mode tables will be far
  larger. Restarting a worker throws its tables away.

## Options for cancellation

1. **Terminate and restart the worker.** Always available, but costs a table rebuild, which grows
   from 0.5 s now to much more in step 6.
2. **Make the search cooperative**, yielding to the event loop every N nodes. This turns a tight
   recursive search into resumable state, slows it down, and cannot be done inside a single
   synchronous WebAssembly call without restructuring the Rust code the same way.
3. **Poll a flag in shared memory.** The page writes one `Int32` in a `SharedArrayBuffer`; the
   search reads it with `Atomics.load` every ~1000 nodes. Needs cross-origin isolation.

## Decision

- Option 3, with option 1 as the fallback when `crossOriginIsolated` is false. The site sends
  `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` in
  development, preview and production (Safari has no `credentialless`) [coep].
- The protocol lives in `@cube/solver-contracts` and is engine-neutral: a cube goes in as cubie
  arrays, moves come out as face turn indices in Kociemba's order, and an engine implements one
  synchronous interface (`init`, `solve`) that the worker host wraps.
- The worker builds its tables as soon as it starts and reports each step; requests sent
  meanwhile wait in its message queue.
- Progress is posted at most ten times a second. Every shorter solution is posted at once, so the
  page can show the search improving.
- One worker per page, started on first use and kept, so its tables are built once.

## Consequences

- Cancelling is instant and keeps the tables. Checked in Chrome 153 on the preview build:
  `crossOriginIsolated` is true, and tables build in about 0.5 s.
- Every resource the page loads must be same-origin or send CORP headers. There are none today;
  third-party embeds would need care.
- Without isolation, cancelling restarts the worker. Caching tables (step 6) keeps that restart
  cheap for the large tables too.
- The UI thread never imports the engines: it talks only to the worker through the contract, so
  adding the WebAssembly engine is a worker-side change.
- The client and host are tested together in Node with the real engine and a message channel that
  delivers on later tasks, including both cancellation paths.

## Sources

- [coep] — MDN, Cross-Origin-Embedder-Policy
- [sab] — MDN, SharedArrayBuffer: security requirements

[coep]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
[sab]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
