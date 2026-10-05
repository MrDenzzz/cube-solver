# @cube/core

Cube model without runtime dependencies: 3×3×3 state at cubie level, face turns derived from
sticker geometry, facelet input with validation, and WCA/SiGN notation. Design notes:
[ADR 0001](../../docs/adr/0001-cube-state-representation.md).

```ts
import { applyAlgorithm, parseFacelets, SOLVED, toFacelets } from '@cube/core';

const scrambled = applyAlgorithm(SOLVED, "R U R' U' x M2");
if (scrambled.ok) console.log(toFacelets(scrambled.value));

const input = parseFacelets(stickersFromCamera); // any six colour symbols, 54 of them
if (!input.ok) {
  // e.g. { code: 'mirrored-corner', position: 'URF', corner: 'URF', facelets: [8, 9, 20] }
  highlight(input.errors);
}
```

| Module          | Contents                                                             |
| --------------- | -------------------------------------------------------------------- |
| `geometry.ts`   | Stickers as points with normals for any N; layer turns as rotations  |
| `cubie.ts`      | `CubieCube`, piece names and facelets, multiplication and inverse    |
| `moves.ts`      | The 18 face turns derived from geometry, metrics, formatting         |
| `facelets.ts`   | Facelet string ⇄ cubies, staged validation with typed errors         |
| `validation.ts` | Group invariants: corner twist, edge flip, permutation parity        |
| `notation.ts`   | WCA and SiGN parser with error offsets                               |
| `algorithm.ts`  | Layer turns for N×N×N; rotations, wide moves and slices on the 3×3×3 |
