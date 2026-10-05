# Research notes (step 1, 2026-10-05)

A snapshot of the research done before writing code: algorithms, table sizes, time and memory
budgets, platform constraints. Decisions are finalised in [ADRs](adr/README.md), which will
replace the estimates below with our own measurements.

Conventions: **(derived)** — computed from published constants; **(estimate)** — our own
projection, to be measured. kociemba.org was unreachable during research and was read through
Wayback Machine snapshots; Michael Reid's cflmath.com currently serves suspicious redirects and
should only be cited via archive.org.

## 1. Fast 3×3×3 solver: Kociemba's two-phase algorithm

- Subgroup G1 = ⟨U, D, R2, L2, F2, B2⟩. Phase 1 coordinates: corner twist 3⁷ = 2187, edge flip
  2¹¹ = 2048, UD-slice edge positions C(12,4) = 495. Phase 2 (10 moves): corner permutation 8!,
  U/D edge permutation 8!, slice edge permutation 4!. Phase 1 needs at most 12 moves, phase 2 at
  most 18 (Reid, 1995). [twophase], [coordlevel], [imptwophase]
- 16 symmetries preserving the UD axis: FlipUDSlice 1,013,760 → 64,430 classes; corner
  permutation 40,320 → 2,768 classes. Tables can store depth mod 3 in 2 bits per entry, since a
  move changes the distance by −1, 0 or +1. [symcord], [pruning]

| Table design              | Kociemba's Python solver                         | min2phase                                     |
| ------------------------- | ------------------------------------------------ | --------------------------------------------- |
| Phase 1                   | FlipSlice classes × twist = 140,908,410 entries  | several small sym-coordinate × raw tables     |
| Phase 2                   | corner classes × U/D edges = 111,605,760 entries | two small tables                              |
| Total size                | ≈ 80 MB; generation "half an hour or more"       | 0.7–1 MB; init ≈ 200 ms (Java), ≈ 350 ms (JS) |
| Speed (author benchmarks) | 0.1 s per cube → 20.02 moves average (CPython)   | ≤ 21 moves: 0.8 ms; ≤ 20 moves: 4.6 ms (Java) |

Sources: [twophase-py], [min2phase-bench]. min2phase does not state the benchmark hardware.

**Direction:** small tables in the min2phase spirit (own implementation), generated in the
worker at start-up, so the fast mode needs no cache and no loading screen. Optimisations are
added one at a time, each backed by a benchmark: baseline → search from three axes and on the
inverse cube (six directions; Kociemba reports ≈ 12× on average [twophase-py]) → pre-moves.

## 2. Optimal 3×3×3 solver

| Approach                                                      | Tables     | Nodes per random cube                                  | Source                |
| ------------------------------------------------------------- | ---------- | ------------------------------------------------------ | --------------------- |
| Korf 1997: corners + two 6-edge PDBs, max                     | 82 MB      | 1.2·10¹¹ at depth 17 (2 days at 700k nodes/s)          | [korf97]              |
| Breyer & Korf: 7-edge PDBs + dual lookups                     | 529 MB     | ≈ 6.6·10⁹ (derived: 65.9·10⁹ over 10 cubes)            | [breyer-korf]         |
| Reid/Kociemba: phase-1 coordinates looked up along 3 axes     | ≈ 35 MB    | ≈ 5·10⁹ (derived: ≈ 5× the "huge" table)               | [optimal]             |
| Kociemba "huge": sorted UD-slice classes (788) × flip × twist | 0.7–0.9 GB | ≈ 10⁹ (derived: 3841 s for 10 cubes at ≈ 2.5M nodes/s) | [optimal-py]          |
| H48 (nissy), cubeopt (Chen Shuang): state of the art          | 0.03–4 GB  | WASM: 486 MB → 4.8 s, 972 MB → 2.4 s per cube          | [h48], [cubeopt-wasm] |

Test sets differ between authors, so node counts are only comparable in order of magnitude.

**Direction:** IDA\* with the Reid/Kociemba heuristic. At similar memory it explores about an
order of magnitude fewer nodes than Korf-style PDBs, and it reuses the two-phase coordinates,
move tables and symmetry code. Two table tiers: ≈ 35 MB (default) and ≈ 0.8 GB (desktop only,
opt-in, after a memory probe). Running the two-phase search until optimality is proven is
rejected: it discards prefixes already in G1 and is "not suited to prove a maneuver optimal"
[imptwophase].

**Expected time (estimate):** Kociemba's Python solver with the huge table averages 384 s per
random cube. If our engines are 10–30× faster than Python, the huge tier takes ≈ 15–40 s and the
35 MB tier ≈ 1–3 min single-threaded. Superflip took 7.3 h (75·10⁹ nodes) in Python, so it stays a
manual benchmark, not a test.

**Verification:** brute-force IDDFS agreement for positions up to ≈ 7 moves; 22 positions with
known optimal lengths from Kociemba's READMEs (data, not code); superflip and the cube20.org
"hardest" position in benchmarks; properties: the optimal length never exceeds the two-phase
length or the scramble length.

## 3. 4×4×4

- 7.40·10⁴⁵ states: 8 corners, 24 edge wings, 24 centres. Wings cannot flip in place; wing
  permutation parity is free (an inner-slice quarter turn is an odd wing permutation); corner
  parity is tied to centre parity, but same-colour centres are indistinguishable, so it is not a
  visible constraint. [jaap]
- A facelet validator checks: 16 stickers per colour and 4 per colour among centres; 8 distinct
  legal corners with correct chirality; corner twist sum ≡ 0 (mod 3); every ordered wing colour
  pair exactly once (catches a mirrored wing). Parities are not checked — none is a constraint.
  Orientation and colour scheme come from corners, since there are no fixed centres.
- WCA notation (Regulations 12a, 2026-04-01): face moves, `Rw` ≡ `2Rw`, `3Rw`, rotations; metric
  OBTM. Lowercase `r` and `2R` are not WCA notation; we accept SiGN on input and emit WCA. [wca]
- Official scrambles are random-state via Chen Shuang's three-phase solver in TNoodle; WC2023
  scrambles were 39–47 moves, mean 44.18 (derived from the WCA API).

**Pipeline** (after TPR [tpr], [cubeman-525]): (1) R/L centres onto R/L faces — 735,471 → 15,582
symmetry classes, 15 KB table; (2) U/D and F/B centres onto their axes, wing parity (removes OLL
parity) and the wing split — ≈ 450 KB; (3) pair dedges, finish centres, PLL parity — ≈ 7.75 MB;
(4) solve as 3×3×3. TPR reports 44.39 moves on average, ≈ 250 ms, 6–7 s init, ≤ 30 MB (Java).

**Parity:** removed inside the search (parity is part of the phase 2 and 3 coordinates) instead of
human parity algorithms, which would add 10–17 OBTM moves. Tests construct both parity cases.

**God's number for 4×4×4 (OBTM)** is unknown: lower bound 35 (Rokicki, 2011), upper bound 55
(Chen Shuang, 2015); a claimed 54 (July 2026) is not yet independently reviewed. [gods-number]

## 4. Platform

- **wasm32 memory:** 4 GiB maximum (Chrome since M83; Firefox and Safari on 64-bit). iOS limits
  are undocumented; 32-bit Chrome on Android caps at 2 GB. Memory64 ships in Chrome 133 and
  Firefox 134 but not in stable Safari, and costs 10–100% speed. → stay on wasm32. [v8-4gb],
  [memory64]
- **Rust → WASM:** the rustwasm org was archived in 2025; wasm-bindgen and wasm-pack moved to the
  wasm-bindgen org (wasm-bindgen 0.2.129, 2026-09-25). We use `cargo build` → `wasm-bindgen
--target web` → `wasm-opt` without wasm-pack: we do not publish to npm, and explicit steps cache
  cleanly. Browser threads still need nightly Rust and `-Z build-std` → one thread per solve in
  v1. [rustwasm-sunset], [wasm-bindgen-threads]
- **TS vs WASM:** credible studies show 0.8–2× for integer, typed-array code; larger claims lack
  primary sources. [imc21], [surma]
- **Cancellation:** a synchronous search blocks the worker's message loop, so a `cancel` message
  is never received. The search polls a SharedArrayBuffer flag every N nodes (WASM through an
  imported JS function); without cross-origin isolation the fallback is `worker.terminate()`.
- **Hosting:** COOP `same-origin` + COEP `require-corp` (Safari lacks `credentialless`). The demo
  runs on our own nginx host, which can set them; GitHub Pages cannot. [coep]
- **Tables:** generated in the worker and cached in OPFS via `FileSystemSyncAccessHandle`
  (dedicated workers; Chrome 102, Firefox 111, Safari 15.2). Safari may evict script-writable
  storage after 7 days without interaction, so the cache is disposable: versioned header and
  checksum, regenerate on a miss. TS and Rust must produce byte-identical tables. [opfs], [webkit-storage]
- **Camera:** HTTPS only; `playsinline` on iOS; no browser reliably exposes manual white balance
  or exposure, so colours are classified in software: sRGB → linear → XYZ → Lab (CSS Color 4),
  CIEDE2000, calibration on centres, assignment with exactly 9 stickers per colour. [css-color-4]

## Open questions to measure

| Question                                             | How                                    |
| ---------------------------------------------------- | -------------------------------------- |
| Search throughput (nodes/s) in TS and WASM           | prototypes in steps 4 and 6            |
| Table generation time (35 MB, ≈ 0.8 GB) in a browser | tablegen and in-worker timing          |
| Practical memory limit on a Pixel 9 Pro XL           | grow-until-failure probe on the device |
| OPFS vs IndexedDB throughput for 100+ MB             | small Playwright benchmark             |
| min2phase numbers on our hardware                    | run it ourselves for reference         |

## Sources

- [twophase], [coordlevel], [imptwophase], [symcord], [pruning], [optimal] — Herbert Kociemba's
  description of the two-phase algorithm and the optimal solver
- [twophase-py], [optimal-py] — Kociemba's Python solvers and their READMEs (benchmarks)
- [min2phase-bench] — Chen Shuang, min2phase benchmarks
- [korf97] — R. Korf, "Finding Optimal Solutions to Rubik's Cube Using Pattern Databases", AAAI-97
- [breyer-korf] — T. Breyer, R. Korf, "1.6-Bit Pattern Databases" (SoCS-09 preprint)
- [h48] — Sebastiano Tronto, H48 optimal solver design notes (nissy-core)
- [cubeopt-wasm] — Chen Shuang, optimal solver in WebAssembly, timings per table size
- [jaap] — Jaap's Puzzle Page, Rubik's Revenge (4×4×4) mathematics
- [wca] — WCA Regulations, Article 12a (notation)
- [tpr], [cubeman-525] — Chen Shuang, three-phase reduction 4×4×4 solver
- [gods-number] — 4×4×4 God's number bounds discussion (Rokicki, Chen Shuang)
- [v8-4gb], [memory64] — wasm32 memory limits and Memory64 cost
- [rustwasm-sunset], [wasm-bindgen-threads] — Rust/WASM toolchain status and threading
- [imc21], [surma] — JS vs WebAssembly performance studies
- [coep], [opfs], [webkit-storage] — cross-origin isolation, OPFS, Safari storage policy
- [css-color-4] — sRGB, XYZ and Lab conversions

[twophase]: https://kociemba.org/math/twophase.htm
[coordlevel]: https://kociemba.org/math/coordlevel.htm
[imptwophase]: https://kociemba.org/math/imptwophase.htm
[symcord]: https://kociemba.org/math/symcord.htm
[pruning]: https://kociemba.org/math/pruning.htm
[optimal]: https://kociemba.org/math/optimal.htm
[twophase-py]: https://github.com/hkociemba/RubiksCube-TwophaseSolver
[optimal-py]: https://github.com/hkociemba/RubiksCube-OptimalSolver
[min2phase-bench]: https://github.com/cs0x7f/min2phase/blob/master/Benchmark.md
[korf97]: https://www.cs.princeton.edu/courses/archive/fall06/cos402/papers/korfrubik.pdf
[breyer-korf]: https://webdocs.cs.ualberta.ca/~nathanst/sara/papers/socs09_submission_17.pdf
[h48]: https://github.com/sebastianotronto/nissy-core/blob/master/doc/h48.md
[cubeopt-wasm]: https://github.com/cs0x7f/cubeopt-wasm
[jaap]: https://www.jaapsch.net/puzzles/cube4.htm
[wca]: https://www.worldcubeassociation.org/regulations/
[tpr]: https://github.com/cs0x7f/TPR-4x4x4-Solver
[cubeman-525]: http://forum.cubeman.org/?q=node/view/525
[gods-number]: http://forum.cubeman.org/?q=node/view/541
[v8-4gb]: https://v8.dev/blog/4gb-wasm-memory
[memory64]: https://spidermonkey.dev/blog/2025/01/15/is-memory64-actually-worth-using.html
[rustwasm-sunset]: https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org
[wasm-bindgen-threads]: https://wasm-bindgen.github.io/wasm-bindgen/examples/raytrace.html
[imc21]: https://weihang-wang.github.io/papers/imc21.pdf
[surma]: https://surma.dev/things/js-to-asc/
[coep]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
[opfs]: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle
[webkit-storage]: https://webkit.org/blog/14403/updates-to-storage-policy/
[css-color-4]: https://www.w3.org/TR/css-color-4/
