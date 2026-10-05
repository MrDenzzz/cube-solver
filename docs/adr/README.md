# Architecture Decision Records

Each significant decision gets one file, `NNNN-short-title.md`, written when the decision is
made and updated with measured numbers later. The format follows Michael Nygard's template:

- **Status** — Proposed, Accepted, or Superseded by NNNN
- **Context** — the forces at play, with numbers and their sources
- **Decision** — what we do
- **Consequences** — what becomes easier or harder, and what we will measure
- **Sources** — primary references for every number used

Background research for these decisions: [../research.md](../research.md).

## Planned

| ADR  | Topic                                                      | Step |
| ---- | ---------------------------------------------------------- | ---- |
| 0001 | Cube state representation                                  | 3    |
| 0002 | Two-phase pruning tables: small (min2phase-style) vs large | 4    |
| 0003 | Pruning-table storage: in-browser generation and OPFS      | 5    |
| 0004 | Optimal solver: Reid/Kociemba heuristic vs Korf PDBs       | 6    |
| 0005 | Rust to WebAssembly toolchain                              | 6    |
| 0006 | TypeScript vs WebAssembly, with measurements               | 6    |
| 0007 | 4×4×4 reduction and parity handling                        | 7    |
| 0008 | Hosting and cross-origin isolation                         | 9    |
