# 0004. Optimal tables: built in the browser, cached in OPFS

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

- The optimal solver's prune table (ADR 0005) is 35.2 MB in the standard tier and 833 MB in the
  huge one. The fast mode's 12 MB of tables build in half a second and are never stored.
- Building the standard table takes 7.7 s in desktop Chrome (6.9 s with the WebAssembly engine);
  the huge one 112–147 s in Node depending on the engine (ADR 0007). Downloading instead would cost
  nearly as much on a first visit: the 35.2 MB standard table compresses only to 24.0 MB with
  gzip -9 and 21.4 MB with brotli -q 11 (68 % and 61 %), and the huge one would need a server that
  serves hundreds of megabytes per visitor.
- A table is consumed as typed arrays: in a `SharedArrayBuffer` for the parallel TypeScript search,
  or inside WebAssembly memory for the Rust engine. Any extra copy of the huge file costs 833 MB
  of peak memory.
- Browsers may evict storage that a script wrote; Safari does after seven days without user
  interaction [webkit-storage]. A cache has to be disposable.

## Options

1. **IndexedDB.** Available everywhere, asynchronous, values are structured clones: a read creates
   a new `ArrayBuffer`, which then has to be copied into shared or WebAssembly memory.
2. **Cache API.** Stores responses; reading the body also yields a fresh buffer. Same copy.
3. **Origin Private File System with synchronous access handles.** Only in dedicated workers,
   which is where the solver runs; `read(buffer, { at })` fills a caller-provided view, shared or
   in WebAssembly memory included (`AllowSharedBufferSource`) [opfs].

## Decision

- Tables are built in the worker on first use of a tier and stored in OPFS with a synchronous
  access handle, one file per tier (`optimal-standard.bin`, `optimal-huge.bin`).
- The engine allocates the read buffer (`allocateTableFile` in the engine contract): shared memory
  for the TypeScript engine's threads, a view of WebAssembly memory for the Rust engine. The file
  lands where it is used, with no copy.
- The file is self-validating: a 32-byte header with a magic number, format version, tier, class
  count, entry count and an FNV-1a checksum of the table words. Anything that does not match, a
  half-written file from a closed tab included, is rebuilt and overwritten. No separate version
  store.
- Both engines write and read the same bytes, so the cache is shared between them.
- Storage failures are not errors: the solver works from memory, and the panel says the table
  could not be stored. After a build, the page asks for persistent storage
  (`navigator.storage.persist()`, which only pages can call) so the browser does not evict it.

## Measurements

Chrome 153, Windows 11, NVMe SSD; one dedicated worker for OPFS, the page for IndexedDB. The
IndexedDB read includes copying the returned buffer into a `SharedArrayBuffer`, which the solver
needs and OPFS avoids. Times in milliseconds.

| Size      | IndexedDB write | IndexedDB read + copy | OPFS write | OPFS read |
| --------- | --------------- | --------------------- | ---------- | --------- |
| 33.6 MiB  | 11–12           | 19–20                 | 23–26      | 7         |
| 267.0 MiB | 83              | 151                   | 154        | 43        |
| 794.6 MiB | 224             | 425                   | 423        | 152       |

Writes happen once per build and are faster in IndexedDB; reads happen on every visit and are
2.8 times faster through OPFS. The decisive difference is memory: an IndexedDB read of the huge
table holds two 833 MB buffers at its peak, the OPFS read one.

## Consequences

- Later visits load the standard table from storage in 45 ms (WebAssembly engine) to 177 ms
  (TypeScript engine, which rebuilds its class index), measured in desktop Chrome including
  validation.
- Without OPFS sync handles (old browsers), tables are rebuilt on each visit.
- Clearing site data drops the cache; the next optimal solve rebuilds it with a progress bar.

## Sources

- [opfs] — MDN, FileSystemSyncAccessHandle; WHATWG File System Standard
- [webkit-storage] — WebKit blog, "Updates to Storage Policy", 2023
- [persist] — MDN, StorageManager.persist()

[opfs]: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle
[webkit-storage]: https://webkit.org/blog/14403/updates-to-storage-policy/
[persist]: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
