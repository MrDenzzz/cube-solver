# 0002. Two-phase pruning tables and search

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

The fast mode has to return solutions of about 20 moves within milliseconds, inside a Web Worker,
with no loading screen and no cache to manage. Two published designs bracket the choice:

- **Kociemba's Python solver** keeps exact phase tables: FlipUDSlice symmetry classes × twist,
  140,908,410 entries (35.2 MB at 2 bits), and corner classes × U/D edges, 111,605,760 entries
  (27.9 MB), about 80 MB with the rest. Generation takes "half an hour or more" in Python
  [twophase-py], [pruning].
- **min2phase** keeps symmetry-reduced tables of coordinate pairs, 0.7–1 MB in total, built in
  about 200 ms (Java), and reports 0.8 ms for ≤ 21 moves and 4.6 ms for ≤ 20 moves per random cube
  on unstated hardware [min2phase].

## Decision

**Search.** Kociemba's algorithm as in `solver.py` [twophase-py]: IDA\* to
G1 = ⟨U, D, R2, L2, F2, B2⟩, then IDA\* inside G1, continuing with longer phase 1 paths while that
can shorten the total. Phase 1 is deepened up to 19 moves, phase 2 uses at most 10, and a node
already in G1 with fewer than 5 moves left does not try phase 2 moves in phase 1. Phase 2
coordinates are replayed along the path only at phase 1 solutions, which are far rarer than
phase 1 nodes.

**Six directions.** The cube is also searched rotated 120° and 240° about the URF–DBL diagonal, and
the inverses of all three, interleaved by phase 1 depth so that the first short phase 1 found in
any direction bounds the others, as min2phase does. Rotation reuses `rotateCube` from `cube-core`
(conjugation by a whole-cube rotation).

**Coordinates.** Kociemba's coordinates and ranges (twist 2187, flip 2048, slice 495, sorted slice
11,880, U and D edges 11,880, corner permutation 40,320, U/D edge permutation 40,320, slice
permutation 24) with our own encodings, chosen so the solved cube and G1 map to 0 and U-edge
values inside G1 stay below 1680 [defs].

**Tables.** The heuristic is the maximum over exact distance tables of coordinate pairs, stored raw
(no symmetry reduction), one byte per entry:

| Phase | Table                              | Entries   |
| ----- | ---------------------------------- | --------- |
| 1     | slice × twist                      | 1,082,565 |
| 1     | slice × flip                       | 1,013,760 |
| 1     | twist × flip                       | 4,478,976 |
| 2     | corner permutation × slice order   | 967,680   |
| 2     | U/D edge permutation × slice order | 967,680   |

With the move tables this is 12.35 MB, generated in about 0.45 s on start. Tables are built level
by level and switch to a backward search once more than half the entries are known, as
Kociemba's `pruning.py` does [twophase-py]; that cut the twist × flip table from 276 to 128 ms.

**Compiler settings.** `solver-ts` disables `noUncheckedIndexedAccess`: search loops index typed
arrays with coordinates that are in range by construction, and the check would only add `?? 0`
noise or runtime cost. Because consumers would otherwise type-check its sources under their own,
stricter settings, `solver-ts` is the one internal package compiled to `dist` with declarations.

## Measurements

AMD Ryzen 7 9800X3D, Node 24.14, single thread, random states from `randomCube` (xoshiro128\*\*,
seed 1), 5 warm-up solves excluded. Times per cube.

How each step changed the search (100 cubes):

| Variant                           | ≤ 21: mean / p95 / max | ≤ 20: mean / p95 / max      |
| --------------------------------- | ---------------------- | --------------------------- |
| one direction, two phase 1 tables | 18.4 / 131 / 160 ms    | 590 / 2730 / 10,000 ms (98) |
| six directions                    | 12.4 / 34 / 222 ms     | 30 / 103 / 488 ms           |
| six directions + twist × flip     | 7.2 / 20 / 108 ms      | 17.6 / 58 / 294 ms          |

(98) — two cubes hit the 10 s limit and returned 21 moves.

Final configuration (1000 cubes, [results](../../tools/bench/results)):

| Target | Mean length | Mean   | Median | p95    | Max     | Nodes/s |
| ------ | ----------- | ------ | ------ | ------ | ------- | ------- |
| ≤ 21   | 20.12       | 7.9 ms | 5.2 ms | 23 ms  | 140 ms  | 12.7 M  |
| ≤ 20   | 19.73       | 35 ms  | 5.6 ms | 145 ms | 2590 ms | 6.1 M   |

## Consequences

- No cache and no loading screen: tables are ready in under half a second, and a typical solve
  takes a few milliseconds.
- About ten times slower than min2phase's own figures, whose hardware is unknown. min2phase
  covers more coordinate combinations through symmetry reduction and adds pre-moves; raw tables
  also cost 12 MB instead of about 1 MB.
- The ≤ 20 target has a long tail (2.6 s worst case over 1000 cubes), so the UI runs with a time
  limit and shows the best solution found by then.
- Symmetry reduction arrives with the optimal solver (step 6). Revisit these tables then, with
  measurements, rather than now.

## Sources

- [twophase-py] — Kociemba, RubiksCube-TwophaseSolver: `solver.py` (search), `pruning.py` (table
  generation), README (sizes and timings)
- [defs] — the same repository, `defs.py` (coordinate ranges)
- [pruning] — Kociemba, pruning tables and the depth mod 3 trick
- [min2phase] — Chen Shuang, min2phase: table design and benchmarks

[twophase-py]: https://github.com/hkociemba/RubiksCube-TwophaseSolver
[defs]: https://github.com/hkociemba/RubiksCube-TwophaseSolver/blob/master/defs.py
[pruning]: https://kociemba.org/math/pruning.htm
[min2phase]: https://github.com/cs0x7f/min2phase
