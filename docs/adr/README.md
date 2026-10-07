# Architecture Decision Records

Each significant decision gets one file, `NNNN-short-title.md`, written when the decision is
made and updated with measured numbers later. The format follows Michael Nygard's template:

- **Status** — Proposed, Accepted, or Superseded by NNNN
- **Context** — the forces at play, with numbers and their sources
- **Decision** — what we do
- **Consequences** — what becomes easier or harder, and what we will measure
- **Sources** — primary references for every number used

Background research for these decisions: [../research.md](../research.md).

## Records

- [0001. Cube state representation](0001-cube-state-representation.md) — Accepted
- [0002. Two-phase pruning tables and search](0002-two-phase-tables-and-search.md) — Accepted
- [0003. Solver worker: protocol, progress and cancellation](0003-solver-worker-protocol.md) — Accepted
- [0004. Optimal tables: built in the browser, cached in OPFS](0004-table-storage.md) — Accepted
- [0005. Optimal solver: Reid's three-axis bound with symmetry-reduced tables](0005-optimal-solver.md) — Accepted
- [0006. Rust to WebAssembly toolchain](0006-rust-to-webassembly-toolchain.md) — Accepted
- [0007. TypeScript vs WebAssembly, and threads](0007-typescript-vs-webassembly.md) — Accepted
- [0008. 4×4×4: three-phase reduction with an exact edge-pairing table](0008-four-by-four-reduction.md) — Accepted

## Planned

| ADR  | Topic                              | Step |
| ---- | ---------------------------------- | ---- |
| 0009 | Hosting and cross-origin isolation | 9    |
