# 0006. Rust to WebAssembly toolchain

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

- The brief asks for the solvers in TypeScript and in Rust compiled to WebAssembly, behind one
  worker protocol, with results cross-checked between them.
- The rustwasm GitHub organisation was archived in 2025; wasm-bindgen continues in its own
  organisation, and wasm-pack is no longer the default path [rustwasm-sunset].
- Threads in WebAssembly need shared memory and atomics in the standard library, which stable Rust
  does not ship for `wasm32-unknown-unknown`: it takes nightly and `-Z build-std`
  [wasm-bindgen-threads].
- The optimal tables reach 794.6 MiB plus a 97 MB class index (ADR 0005). wasm32 memory is limited
  to 4 GiB [v8-4gb]; Memory64 is not in stable Safari and costs speed [memory64].
- A saved table file is read from the Origin Private File System into a buffer (ADR 0004). Copying
  833 MB from a JavaScript buffer into WebAssembly memory would double the peak memory.

## Decision

- **Build:** `cargo build --release --target wasm32-unknown-unknown`, then the wasm-bindgen CLI
  (`--target web`), then `wasm-opt -O3` from the `binaryen` npm package. No wasm-pack: we do not
  publish to npm, and three explicit steps cache cleanly in Turborepo. The script fails early when
  the wasm-bindgen CLI and the crate (pinned with `=`) disagree.
- **Crates:** `cube` (geometry, cubies, coordinates), `solver` (two-phase and optimal search,
  tables), `bindings` (the wasm-bindgen boundary). The first two have no WebAssembly-specific code
  and are tested natively with `cargo test`.
- **Same derivation, not ported tables.** Moves and the 16 symmetries are derived from sticker
  geometry exactly as `@cube/core` and `@cube/solver-ts` do, and coordinates use the same
  encodings. The optimal table is then byte-identical between the engines, which a test checks,
  and either engine loads the file the other saved.
- **Typed callbacks instead of `js-sys`.** Progress, time and cancellation come in as one
  JavaScript object declared with `extern "C"` types and a TypeScript section, so the generated
  `.d.ts` has a real `SearchCallbacks` interface rather than loose `Function`s, and the bindings
  need no crate beyond wasm-bindgen. `wasm32-unknown-unknown` has no clock; time is one of the
  callbacks.
- **Zero-copy table files.** The engine allocates the file buffer (`Vec<u32>`, so 4-byte aligned)
  and returns its address; JavaScript reads the OPFS file into a view of WebAssembly memory at that
  address and the engine adopts the vector. Allocation may grow the memory, which detaches older
  views, so views are created after the call that allocates.
- **One thread per solve.** The parallel optimal search stays in the TypeScript engine, whose
  tables live in `SharedArrayBuffer`s (ADR 0005). WebAssembly threads would need nightly Rust.
- **Safety:** `unsafe_code = "deny"` for the whole workspace, Clippy pedantic as warnings and
  `-D warnings` in CI. Addresses cross the boundary as integers, so no `unsafe` is needed.

## Consequences

- The module is 79.75 kB (33.2 kB gzip) after wasm-opt, smaller than the TypeScript engine's
  worker bundle with its dependencies.
- Cross-engine tests in `packages/solver-wasm/test` compare: the optimal table byte for byte, exact
  axis distances, optimal solutions and their node counts, and fast-mode solutions by applying
  them. Rust's own tests check moves against Kociemba's published cubie tables and short optimal
  solutions against brute force.
- Changing a coordinate encoding means changing it in both languages; the byte-identical table
  test fails otherwise.
- The huge tier fits in wasm32 memory (about 0.95 GB with the fast tables); the standard and huge
  tables are never held at the same time.
- Speed numbers are in ADR 0007.

## Sources

- [rustwasm-sunset] — Inside Rust Blog, "Sunsetting the rustwasm GitHub org", 2025-07-21
- [wasm-bindgen-threads] — wasm-bindgen guide, parallel raytracing example (threads need nightly)
- [v8-4gb] — V8 blog, "Up to 4GB of memory in WebAssembly"
- [memory64] — SpiderMonkey blog, "Is Memory64 actually worth using?", 2025-01-15

[rustwasm-sunset]: https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org
[wasm-bindgen-threads]: https://wasm-bindgen.github.io/wasm-bindgen/examples/raytrace.html
[v8-4gb]: https://v8.dev/blog/4gb-wasm-memory
[memory64]: https://spidermonkey.dev/blog/2025/01/15/is-memory64-actually-worth-using.html
