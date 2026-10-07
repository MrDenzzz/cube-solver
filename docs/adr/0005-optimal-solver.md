# 0005. Optimal solver: Reid's three-axis bound with symmetry-reduced tables

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

An optimal solution has to be proven: every shorter sequence must be ruled out, which is
IDA\* with an admissible lower bound. What decides the speed is how much the bound prunes per byte
of table and how fast a node is generated. Published designs, from the step 1 research:

| Approach                                               | Tables    | Nodes per random cube   | Source           |
| ------------------------------------------------------ | --------- | ----------------------- | ---------------- |
| Korf: corner and two 6-edge pattern databases          | 82 MB     | 1.2·10¹¹ at depth 17    | [korf97]         |
| Breyer and Korf: 7-edge databases with dual lookups    | 529 MB    | ≈ 6.6·10⁹               | [breyer-korf]    |
| Reid: phase 1 of the two-phase algorithm on three axes | 34 MB     | ≈ 5·10⁹ (derived)       | [reid]           |
| Kociemba: the same with the slice edges also in order  | 794 MB    | ≈ 10⁹ (his ten cubes)   | [optimal-py]     |
| H48 (nissy), cubeopt: current state of the art         | 0.03–4 GB | WASM 2.4–4.8 s per cube | [h48], [cubeopt] |

Constraints: the solver runs in a Web Worker, tables are built in the browser or loaded from its
storage (ADR 0004), phones have far less memory than desktops, and wasm32 stops at 4 GiB.

## Decision

**Bound.** For the cube seen along each of its three axes (as given, and turned 120° and 240° about
the URF–DBL diagonal), the exact distance to the phase 1 subgroup
⟨U, D, R2, L2, F2, B2⟩ is a lower bound; so is the largest of the three, and the distance of the
corner permutation alone, as in Reid's solver and Kociemba's `solver.py` [reid], [optimal-py].
When all three axis distances are equal and non-zero, at least one more move is needed: a solution
of exactly d moves would reach all three subgroups only with its last move, but the state before
that move is one face turn from solved, and every face turn lies in the subgroup of its own axis.

**Two tiers of the same table.**

| Tier     | Subgroup                          | Classes × twists  | Entries       | File          |
| -------- | --------------------------------- | ----------------- | ------------- | ------------- |
| standard | phase 1                           | 64,430 × 2,187    | 140,908,410   | 35,227,136 B  |
| huge     | phase 1 with slice edges in order | 1,523,864 × 2,187 | 3,332,690,568 | 833,172,676 B |

Each entry is the exact distance mod 3 in 2 bits; a move changes the distance by at most one, so
the search recovers it from the parent's [pruning]. The class index (raw value → class and
symmetry) adds 4 MB and 97 MB. The standard tier is the default everywhere; the huge one is an
explicit choice for desktops.

**Symmetry.** The 16 symmetries of D4h are generated from three integer matrices and act on
stickers, so mirror images need no special corner arithmetic. Edges are conjugated at cubie level
for speed, the twist through stickers once into a 2,187 × 16 table. Class representatives are the
smallest raw values; entries of a representative fixed by a symmetry come in groups of equivalent
twists, which the table build fills together, as Kociemba's `pruning.py` does.

**Build.** Breadth-first by levels, forward until half the entries are known, then backward: each
unknown entry looks for a neighbour on the current level and stops at the first.

**Upper bound first.** Before the search, the two-phase solver gets up to a second, and stops as
soon as it reaches the lower bound. Its solution is shown at once, kept if the user cancels, and
returned as proven once every shorter length has been searched, which skips the last and usually
longest iteration.

**Parallel search.** The TypeScript engine splits each depth into tasks, the moves of the first
three levels, which every thread takes from an atomic counter; tables live in
`SharedArrayBuffer`s and threads meet after each depth, so the result stays optimal. Details in
`packages/solver-ts/src/parallel.ts`.

**Rejected.** Korf's databases prune less at similar memory and share nothing with the two-phase
code. Running the two-phase search until optimality is proven discards prefixes already in the
phase 1 subgroup and is "not suited to prove a maneuver optimal" [imptwophase]. H48-class solvers
are faster but are a research project of their own; the README compares against them honestly.

## Verification

- Class counts come out at 64,430 and 1,523,864, the values in Kociemba's `defs.py`, for both
  engines.
- Axis distances agree with an independent IDA\* over raw coordinates bounded by the two-phase
  pair tables; short scrambles agree with brute force.
- With the huge table, the nodes generated at every completed depth equal the counts in the
  README of Kociemba's optimal solver for all twelve published positions (ten random cubes, the
  superflip and the hardest cube20.org position, depths 14 to 19 where published), and the
  17-move solutions of his random cubes 4 and 9 are move for move the same.
- The parallel search generates exactly the sequential node counts at completed depths, and the
  Rust engine exactly the TypeScript ones.

## Measurements

Through depth 16 on Kociemba's ten random positions (method and all engines in ADR 0007), the
huge table generates 240,227,325 nodes against 1,935,824,526 with the standard one, 8.1 times
fewer. It costs more per node, being memory-bound, and is 2.2 times faster overall.

Full optimal solves of the same ten cubes with the huge table, TypeScript engine on one thread,
two-phase upper bound on: 1,863 s in total (20 s to 654 s per cube), all optimal lengths as
published. Kociemba's PyPy solver needed 3,841 s on a Ryzen 7 3700X [optimal-py]. The two slowest
cubes were the ones where the quick two-phase pass did not find an 18-move solution, so the
final depth had to be searched; elsewhere the upper bound skipped it. This run shared the machine
with other work and is indicative; the controlled comparison is in ADR 0007.

In the browser, a 17-move position takes seconds on a desktop with the TypeScript engine's
threads (4.1 s on 15 threads for Kociemba's random cube 4, standard table).

## Consequences

- A random cube is solved optimally in the browser in seconds to minutes depending on the tier
  and the number of cores; the superflip (20 moves) remains a manual benchmark that takes hours.
- The huge tier needs about 0.95 GB of memory and a build of minutes; it is offered on desktops
  only and cached after the first build.
- The table file format is shared with the Rust engine (ADR 0006) and versioned in its header.

## Sources

- [korf97] — R. Korf, "Finding Optimal Solutions to Rubik's Cube Using Pattern Databases", AAAI-97
- [breyer-korf] — T. Breyer, R. Korf, "1.6-Bit Pattern Databases", SoCS 2009 submission
- [reid] — M. Reid, optimal solver description (1997), via archive.org
- [optimal-py] — H. Kociemba, RubiksCube-OptimalSolver: README (positions, node counts, timings),
  `solver.py`, `pruning.py`, `defs.py`
- [pruning] — H. Kociemba, pruning tables and distances mod 3
- [imptwophase] — H. Kociemba, the improved two-phase algorithm
- [h48] — S. Tronto, H48 design notes (nissy-core)
- [cubeopt] — Chen Shuang, cubeopt-wasm

[korf97]: https://www.cs.princeton.edu/courses/archive/fall06/cos402/papers/korfrubik.pdf
[breyer-korf]: https://webdocs.cs.ualberta.ca/~nathanst/sara/papers/socs09_submission_17.pdf
[reid]: https://web.archive.org/web/2011/http://www.cflmath.com/Rubik/optimal_solver.html
[optimal-py]: https://github.com/hkociemba/RubiksCube-OptimalSolver
[pruning]: https://kociemba.org/math/pruning.htm
[imptwophase]: https://kociemba.org/math/imptwophase.htm
[h48]: https://github.com/sebastianotronto/nissy-core/blob/master/doc/h48.md
[cubeopt]: https://github.com/cs0x7f/cubeopt-wasm
