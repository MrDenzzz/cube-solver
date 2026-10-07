# 0008. 4×4×4: three-phase reduction with an exact edge-pairing table

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

- No practical solver searches the 4×4×4 directly: they reduce it to a 3×3×3 (centres solved,
  edge pairs joined) and finish with a 3×3×3 solver. Chen Shuang's TPR does the reduction in
  three phases after Tsai's method and finishes with min2phase; its README reports 44.39 moves on
  average over 2,000 random states, 250 ms per solve on an i7-2670QM, tables of about 20 MB
  built in 6–7 s [tpr], [tsai].
- The solver must work on phones and must be usable on a real cube: answers within about a
  second, tables built in the browser without a download, solutions in moves a person can make.
- A 4×4×4 has no fixed centres, so any orientation is just another state. The cube model
  (`packages/cube-core/src/cube4.ts`) tracks 8 corners, 24 wings and 24 centre stickers.

## Decision

The reduction follows TPR. Moves are the 18 outer turns and Uw, Rw, Fw with their powers (27,
outer block turn metric); Dw, Lw, Bw equal those up to a whole-cube turn, which the 4×4×4 does not
need. Every phase is IDA\* over exact tables:

| Phase | Goal                                                                | Moves                                  | Table                                                   |
| ----- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| 1     | The centres of one colour pair on the R/L faces                     | all 27                                 | C(24, 8) = 735,471                                      |
| 2     | The other centres on their axes, even wing permutation, wings ready | outer, Rw, Uw2, Fw2 (23)               | 12,870 × 70 × 2 = 1,801,800                             |
| 3     | Centres solved, edges paired, PLL parity even                       | U, D, F, B, R2, L2, Uw2, Rw2, Fw2 (17) | centres 70³ × 2 = 686,000; edges 31,006,080 (see below) |
| 3×3×3 | Solved                                                              | outer turns                            | the two-phase solver of ADR 0002                        |

- **Axis choice.** Phase 1 runs on the cube recoloured by each of three whole-cube rotations, so
  whichever colour pair is closest to an axis goes first.
- **Parity.** Only inner quarter turns change the parity of the wing permutation, so phase 2
  carries that bit in its coordinate and ends with it even. Phase 3's moves keep each edge's two
  wings in two fixed slot classes ("low" and "high", the orbits of those moves), so phase 2 must
  end with one wing of each edge in a low slot, an even matching between low and high wings and an
  even number of flipped edges; solutions that miss this are skipped. Phase 3 carries the parity
  of the low wings against the corners next to the centres and ends with it even. The reduced
  cube is then always a legal 3×3×3: no OLL or PLL parity is left for the finish.
- **Edge bound in phase 3.** The edges are one permutation σ: the high slot holding the partner
  of each low wing. A move with low and high permutations L and H sends σ to H·σ·L⁻¹, and σ stays
  even: 12!/2 = 239,500,800 states. The 16 symmetries of the cube that keep the R–L axis preserve
  the distance to pairing: each maps phase 3's moves to phase 3's moves or to Dw2, Lw2, Bw2, which
  differ from Uw2, Rw2, Fw2 by a whole-cube turn that leaves paired edges paired. A breadth-first
  search over the plain permutations to depth 6 (71,552 states) agrees with all 16. The 8 that
  keep the slot classes also keep the four M-slice positions among themselves, so σ's entries
  there have symmetry classes of their own: 1,538 of them, times 20,160 ranks of the next six
  entries, 31,006,080 entries at 2 bits (7.4 MiB). Distances are exact to 9 (2,778,197 states,
  the same count as TPR's table) and stored as "10 or more" beyond, as TPR does: filling the rest
  would cost seconds for a bound needed only near the start of each search.
- **Candidates.** Phase 1 keeps the 200 best of all its solutions up to one move longer than the
  shortest; phase 2 enumerates by total length until 100 solutions leave the wings ready; phase 3
  takes the 4 shortest reductions; each is finished by the two-phase solver (6 directions, stop at
  18 moves, 50 ms), the shortest whole solution wins, and turns that meet at the seams are merged.

## Results

`tools/bench/src/four.ts`, 200 random states (`randomCube4`, seed 1), every solution checked. AMD
Ryzen 7 9800X3D, Windows 11, Node 24.14.1. Raw results: `tools/bench/results/reduction-ts-*.json`.

| Candidates, phase 2 / 3 | Finish | Mean length | Phases, mean                | Median ms | p95 ms | Max ms |
| ----------------------- | ------ | ----------- | --------------------------- | --------- | ------ | ------ |
| 20 / 1                  | 50 ms  | 46.05       | 6.89 + 6.29 + 13.35 + 19.52 | 169       | 463    | 1,335  |
| 100 / 1                 | 50 ms  | 45.76       | 6.92 + 6.43 + 12.91 + 19.50 | 248       | 642    | 1,510  |
| **100 / 4** (default)   | 50 ms  | **45.19**   | 6.92 + 6.46 + 12.97 + 18.84 | 621       | 1,391  | 1,998  |
| 100 / 8                 | 30 ms  | 45.17       | 6.89 + 6.54 + 13.05 + 18.70 | 985       | 2,175  | 4,403  |

- Tables: 0.70 s for phases 1–3 (centres) and 0.46 s for the edge table in Node; 11.1 MB in all,
  built in 990 ms in Chrome 153 on the same machine. The 3×3×3 tables are shared with the fast
  mode.
- The edge table replaced a first bound, the maximum over six groups of five edges (each group
  75,271,680 states: low set × high set × matching, 17.9 MiB, 5.9 s to build). With it phase 3
  dominated: median 5.3 s and up to 22 s per solve on 20 cubes, with 20 phase 2 candidates. With
  the exact table phase 3 takes 10–300 ms.
- The default spends half a second more than 20 / 1 for 0.9 moves less; 8 reductions add nothing.
  Solutions stay about 0.8 moves longer than TPR's reported 44.39 [tpr]; TPR keeps more
  candidates (500 phase 1 solutions out of up to 10,000) and finishes with min2phase. Closing that
  gap was not pursued.

## Consequences

- The 4×4×4 solver exists in TypeScript only. With the WebAssembly engine selected, a TypeScript
  worker of its own serves the 4×4×4; porting the reduction to Rust is possible but not planned.
- Without fixed centres the instructions cannot name a hold by centre colours. The guide names
  the corner at the top front right of the starting state and the colour on each of its sides,
  which fixes the hold whichever way the cube was scrambled, typed in or scanned; the sticker
  hints name positions instead of colours.
- Sticker entry on a phone is cramped: the 4×4×4 net is 16 stickers wide, about 16 px each at
  390 px. Camera input (step 8) is the answer there.

## Sources

- [tpr] Chen Shuang, TPR-4x4x4-Solver, https://github.com/cs0x7f/TPR-4x4x4-Solver — README
  (44.39 moves, 250 ms, table size and time), `src/Edge3.java` (`N_SYM = 1538`,
  `N_RAW = 20160`, `prunValues`), `src/Search.java` (candidate counts).
- [tsai] Tsai's 8-step 4×4×4 algorithm, linked from the TPR README:
  http://cubezzz.dyndns.org/drupal/?q=node/view/73#comment-2588
