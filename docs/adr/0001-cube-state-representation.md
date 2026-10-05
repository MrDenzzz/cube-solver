# 0001. Cube state representation

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

- The solvers (two-phase, optimal, 4×4×4 reduction) work on coordinates computed from piece
  permutations and orientations. Kociemba's published coordinate ranges and symmetry class counts
  (2187 twists, 2048 flips, 495 slice positions, 64,430 FlipUDSlice classes, 2,768 corner
  permutation classes) hold for one specific labelling of pieces and orientations [cubielevel],
  [symcord].
- Input arrives as stickers: typed facelet strings, colours painted on a net, camera scans.
  Rejections have to point at stickers and say what is physically wrong.
- Algorithms in the wild mix face moves with rotations, wide moves and slices (WCA Regulations
  12a, plus SiGN extensions) [wca-12a].
- A 4×4×4 model follows in step 7: no fixed centres, wings instead of edges.

## Options

1. **Stickers only** (54 symbols). Simple input and output, moves are sticker permutations. But
   every coordinate needs piece identification first, orientation is implicit, and invariants are
   awkward to check.
2. **Generic orbits** (a puzzle as orbits of pieces with permutation and orientation, as in
   cubing.js). General enough for any puzzle, but its conventions do not match the published
   coordinates, and it is more abstraction than two puzzles need.
3. **Cubie level with Kociemba's conventions.** Chosen.

## Decision

- The canonical 3×3×3 state is `CubieCube { cp, co, ep, eo }` in the "is replaced by" convention,
  with Kociemba's piece order and orientation definitions. It is relative to the centres.
- Stickers are an input/output format in Kociemba's 54-facelet order. Any six distinct symbols
  are accepted as colours, identified by the centres.
- Moves are derived rather than typed in. Stickers are points with normals; a layer turn is a
  rotation of those points; the cubie effect of a face turn is read back from the turned stickers.
  Tests pin the result to Kociemba's published facelet and move tables and check group properties:
  inverses, order four, commuting opposite faces, the orders of R U R′ U′ (6) and R U (105), and
  two 20-move superflip maneuvers [cube20].
- Rotations, wide moves and slices are expanded into face turns relative to the centres, with the
  whole-cube orientation tracked in a frame: Rw = L·x, M = L′·R·x′.
- Validation runs in stages — length, centres, colours, pieces, duplicates, then the three group
  invariants (corner twist, edge flip, permutation parity) — and returns typed error codes with
  the stickers to highlight. The UI translates codes; the core has no user-facing strings.
- `cube-core` uses small immutable arrays. Solvers build typed-array move tables from it once and
  never touch `CubieCube` in their search loops.

## Consequences

- Coordinates and table sizes in `solver-ts` can be checked against Kociemba's numbers, and the
  Rust engine can be checked against `cube-core` through shared fixtures.
- The sticker geometry is generic in N, so the 4×4×4 reuses the facelet layout and layer turns and
  adds wings and centres.
- The 4×4×4 still needs its own piece model; `CubieCube` does not stretch to it.
- Immutable arrays allocate on every operation. That is fine outside search loops, which is the
  only place this package is used.
- A centre-relative state forgets the cube's orientation. The 3D viewer has to track orientation
  itself when it animates rotations and wide moves.

## Sources

- [cubielevel], [symcord] — Kociemba, cubie level and symmetry reduced coordinates
- [twophase-py] — Kociemba's two-phase solver; `defs.py` and `cubie.py` provide the reference
  tables used in the tests
- [wca-12a] — WCA Regulations, Article 12a (version of April 1, 2026)
- [cube20] — God's number 20 and superflip maneuvers

[cubielevel]: https://kociemba.org/math/cubielevel.htm
[symcord]: https://kociemba.org/math/symcord.htm
[twophase-py]: https://github.com/hkociemba/RubiksCube-TwophaseSolver
[wca-12a]: https://github.com/thewca/wca-regulations/blob/official/wca-regulations.md
[cube20]: https://www.cube20.org/
