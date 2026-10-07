# 0007. TypeScript vs WebAssembly, and threads

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

- Both engines implement the same algorithms with the same tables (ADR 0005, ADR 0006); the
  question is what each is worth in practice. Published comparisons of JavaScript and WebAssembly
  on integer, typed-array code range from 0.8× to 2× [imc21], [surma]; larger claims lack primary
  sources.
- The TypeScript engine can search on several threads with tables in shared memory; WebAssembly
  threads would need nightly Rust (ADR 0006).
- Numbers should be comparable: same positions, same work, measured alternately to spread drift
  in clock speed.

## Method

`tools/bench/scripts/optimal-suite.sh`: Kociemba's ten published random positions
(`tools/bench/src/positions.ts`), each searched through depth 16 without an upper bound, so every
run generates exactly the same nodes: 1,935,824,526 with the standard table and 240,227,325 with
the huge one, which every run reproduced. Single-thread runs were repeated, engines interleaved.
AMD Ryzen 7 9800X3D (8 cores, 16 threads), Windows 11, Node 24.14.1; tables loaded from files.
Raw results: `tools/bench/results/optimal-*.json`.

## Results

| Engine      | Threads | Table    | Time            | Nodes/s       |
| ----------- | ------- | -------- | --------------- | ------------- |
| TypeScript  | 1       | standard | 106.2 / 106.4 s | 18.2 M        |
| WebAssembly | 1       | standard | 58.3 / 60.8 s   | 33.2 / 31.8 M |
| TypeScript  | 8       | standard | 11.9 s          | 162.5 M       |
| TypeScript  | 16      | standard | 9.2 s           | 211.5 M       |
| TypeScript  | 1       | huge     | 48.1 / 48.3 s   | 5.0 M         |
| WebAssembly | 1       | huge     | 27.0 / 27.2 s   | 8.9 / 8.8 M   |
| TypeScript  | 16      | huge     | 3.6 s           | 67.2 M        |

Table preparation, same machine:

| Step                                 | TypeScript | WebAssembly |
| ------------------------------------ | ---------- | ----------- |
| Build the standard table             | 8.0 s      | 6.9 s       |
| Build the huge table                 | 146.6 s    | 112.0 s     |
| Restore the standard table from file | 150 ms     | 41 ms       |
| Restore the huge table from file     | 3.7 s      | 0.84 s      |

In the browser (Chrome 153.0.8010.55, same machine), on Kociemba's random cube 4 with the
standard table: the TypeScript engine on 15 threads proved its 17-move solution in 4.1 s
(741 million nodes); the WebAssembly engine on one thread took 35.9 s (739 million).

## Decision

- Keep both engines and let the user switch; the TypeScript engine is the default because on any
  device with more than two cores its parallel search is the fastest option by far.
- Report the WebAssembly engine as what it is: 1.8 times the TypeScript engine per thread, on
  both tiers, which sits at the top of the published 0.8–2× range.

## Consequences

- Searching is memory-bound with the huge table (5–9 M nodes/s against 18–33 M with the standard
  one), yet the huge table is still 2.2 times faster overall, generating 8.1 times fewer nodes.
- Eight threads gave 8.9 times the single-thread rate and sixteen (with SMT) 11.6 times. Slightly
  above linear at eight is within this machine's run-to-run spread, so we read it as linear
  scaling: a depth this deep has thousands of tasks, and the barrier after each depth costs
  little.
- Both engines rebuild the class index (1 M or 24 M raw values) when they load a table; Rust does
  it 3.6–4.4 times faster. Storing the index in the file too would make loading nearly free.
- Single-thread rates differed by up to 1.7 times between sessions on this machine (clock boost
  and power state), while repeats within a session agreed within 5 %: comparisons are only made
  between interleaved runs of one session.

## Sources

- [imc21] — Y. Yan et al., "Understanding the Performance of WebAssembly Applications", IMC 2021
- [surma] — Surma, "Is WebAssembly magic performance pixie dust?", 2021

[imc21]: https://weihang-wang.github.io/papers/imc21.pdf
[surma]: https://surma.dev/things/js-to-asc/
