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
