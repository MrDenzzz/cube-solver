# @cube/bench

Benchmarks the solvers on a fixed set of uniformly random states (`randomCube` with a seeded
xoshiro128\*\*), so runs on different machines and engines see the same cubes. Every returned
solution is applied to its cube and checked before it is counted.

```sh
pnpm --filter @cube/solver-ts build
pnpm --filter @cube/bench bench --count 1000 --seed 1 --max-length 20 \
  --json results/two-phase-ts-20.json
```

| Option         | Default | Meaning                                                     |
| -------------- | ------- | ----------------------------------------------------------- |
| `--count`      | 100     | Number of cubes                                             |
| `--seed`       | 1       | Generator seed for the measured cubes                       |
| `--max-length` | 20      | Stop at the first solution of at most this many moves       |
| `--time-limit` | 10000   | Then return the best solution so far, in milliseconds       |
| `--directions` | 6       | 1 searches the cube as given; 6 adds rotations and inverses |
| `--warmup`     | 5       | Unmeasured solves first, on cubes from another seed         |
| `--json`       |         | Write the full report, including every sample               |
| `--markdown`   |         | Write the summary table                                     |

Results of record live in [results](results), named `<engine>-<target>.json`.

## Optimal solver

`bench:optimal` runs the optimal solver on the positions published with Kociemba's optimal solver
(`src/positions.ts`: ten random cubes, the superflip and the hardest cube20.org position) and
compares the nodes generated at each completed depth with his counts; with the huge table they
match exactly. Tables come from `../../.cache` (built and saved there on first use, or by
`pnpm --filter @cube/tablegen gen`).

```sh
pnpm --filter @cube/bench bench:optimal --tier standard --through-depth 16 --no-upper-bound
pnpm --filter @cube/bench bench:optimal --engine wasm --tier huge --only "random 4"
```

| Option            | Default    | Meaning                                                         |
| ----------------- | ---------- | --------------------------------------------------------------- |
| `--engine`        | `ts`       | `ts` or `wasm` (one thread)                                     |
| `--tier`          | `standard` | `standard` (35 MB) or `huge` (794 MiB)                          |
| `--threads`       | 1          | Threads for the TypeScript engine's parallel search             |
| `--through-depth` |            | Stop after this depth: same work in every run, no full solve    |
| `--upper-bound`   | on         | Get a bound from the two-phase solver first; `--no-upper-bound` |
| `--positions`     | `kociemba` | Or `random`, with `--count` and `--seed`                        |
| `--only`          |            | Comma-separated position names                                  |

`scripts/optimal-suite.sh` runs the comparison behind ADR 0007 with engines interleaved; its
results are the `optimal-*` files in [results](results).

## 4×4×4 reduction

`bench:four` solves random 4×4×4 states (`randomCube4`) with the reduction solver and reports
length, phase lengths and time. The results behind ADR 0008 are the `reduction-ts-*` files.

```sh
pnpm --filter @cube/bench bench:four --count 200 --json results/reduction-ts-100-4.json
```

| Option                | Default | Meaning                                                    |
| --------------------- | ------- | ---------------------------------------------------------- |
| `--count`             | 100     | Number of cubes                                            |
| `--seed`              | 1       | Generator seed for the measured cubes                      |
| `--phase1-candidates` | 200     | Phase 1 solutions kept for phase 2                         |
| `--phase2-candidates` | 100     | Phase 2 solutions that leave the wings ready for phase 3   |
| `--phase3-candidates` | 4       | Reduced cubes finished as a 3×3×3; the shortest total wins |
| `--finish-time`       | 50      | Milliseconds for each 3×3×3 finish                         |
| `--warmup`            | 3       | Unmeasured solves first, on cubes from another seed        |
