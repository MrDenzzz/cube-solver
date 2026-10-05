# cube-solver

Rubik's cube 3×3×3 and 4×4×4 solver that runs entirely in the browser: Kociemba's two-phase
algorithm, an optimal IDA\* solver and 4×4×4 reduction, each implemented twice — in TypeScript
and in Rust compiled to WebAssembly — with a step-by-step 3D replay in React Three Fiber.

**Demo:** <https://cube.mrdenzzz.ru> (deployed from `main` on every green CI run, see
[docs/deploy.md](docs/deploy.md)). Type or generate a scramble, solve it in a Web Worker with live
progress and cancellation, and replay the solution move by move in 3D, in English or Russian.

> **Status:** work in progress. The monorepo scaffold, CI and deployment are in place; the solvers
> land step by step (see [Roadmap](#roadmap)). Design research with sources:
> [docs/research.md](docs/research.md).

## Roadmap

1. [x] Research: algorithms, table sizes, time and memory budgets
2. [x] Monorepo scaffold, shared configs, CI, deployment
3. [x] `cube-core` for 3×3×3 with property-based tests
4. [x] Two-phase solver in TypeScript, CLI benchmark
5. [x] Web app: 3D cube, scramble input, solving in a Web Worker
6. [ ] Optimal 3×3×3 solver; Rust/WASM port and TS vs WASM comparison
7. [ ] 4×4×4 model and reduction solver
8. [ ] Input by painting facelets and by camera
9. [ ] Benchmarks page, deployment, final README and ADRs

## Benchmarks

Two-phase solver, TypeScript, 1000 uniformly random states (seed 1), AMD Ryzen 7 9800X3D,
Node 24, one thread. Tables: 12.35 MB, built in 0.45 s at start. Method and history:
[ADR 0002](docs/adr/0002-two-phase-tables-and-search.md); raw data: [tools/bench](tools/bench).

| Target     | Mean length | Mean   | Median | p95    | Max     |
| ---------- | ----------- | ------ | ------ | ------ | ------- |
| ≤ 21 moves | 20.12       | 7.9 ms | 5.2 ms | 23 ms  | 140 ms  |
| ≤ 20 moves | 19.73       | 35 ms  | 5.6 ms | 145 ms | 2590 ms |

## Repository layout

| Path                        | Purpose                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `apps/web`                  | Vite + React app: 3D cube, state input, solver in a Web Worker, benchmarks |
| `packages/cube-core`        | Cube model, moves, WCA notation, state validation; no runtime dependencies |
| `packages/solver-contracts` | Solver interface and the worker message protocol (progress, cancellation)  |
| `packages/solver-ts`        | Solvers in TypeScript, pruning tables in typed arrays                      |
| `packages/solver-wasm`      | The same solvers in Rust (`crates/`), compiled to WebAssembly              |
| `packages/test-fixtures`    | Fixtures shared by both engines: seeded scrambles, known optimal positions |
| `tools/bench`               | CLI benchmarks over a fixed seeded scramble set; JSON and Markdown output  |
| `tools/tablegen`            | Offline pruning-table generation and reference checksums                   |
| `docs/adr`                  | Architecture decision records                                              |

## Development

Requirements:

- Node.js 24 and pnpm (the version is pinned in `packageManager`)
- Rust toolchain from `rust-toolchain.toml` (rustup installs it on first use)
- wasm-bindgen CLI matching the crate version:
  `cargo install wasm-bindgen-cli --version 0.2.129 --locked`

```sh
pnpm install
pnpm check                    # lint, typecheck, test and build (including WASM) via Turborepo
pnpm turbo run dev --filter=@cube/web...   # dev server plus watch builds of its dependencies
cargo test --workspace        # Rust unit tests
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/); a `commit-msg`
hook checks them with commitlint.

## License

[MIT](LICENSE)
