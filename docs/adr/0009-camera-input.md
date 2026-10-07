# 0009. Camera input: one face at a time, CIEDE2000 and balanced groups

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

- Typing 54 or 96 stickers is the slowest part of solving a real cube, and on a phone the 4×4×4
  net leaves stickers about 16 px wide (ADR 0008). A camera reads a face in one tap.
- Sticker colours on camera vary with the light: warm bulbs push white towards yellow, and red
  and orange stickers differ mainly in hue. Fixed thresholds on RGB or HSV values break as soon
  as the light changes.
- A cube's colours are constrained: each of the six covers exactly one face's worth of stickers,
  and on the 3×3×3 each centre is, by definition, its face's colour.

## Decision

- **Capture.** The rear camera (`facingMode: environment`) where there is one, at up to 1280×720,
  with a grid over the centred square of 70 % of the frame's shorter side. Faces are shot in the
  sticker editor's order and holds, which match the facelet order, so the picture's rows and
  columns are the face's facelets; the preview is not mirrored for the same reason. Each cell's
  middle 40 % is reduced to the per-channel median, which ignores glare spots and the black gaps
  between stickers.
- **Colour difference.** Samples are compared in CIELAB (D65) with CIEDE2000, which weighs hue
  differences among saturated colours more than plain Lab distance does. The implementation
  reproduces all 34 test pairs of Sharma, Wu and Dalal to four decimals [sharma].
- **Classification.** Only after all six faces: the samples are split into six groups of exactly
  N² each (closest pairs first, then swaps between groups while they lower the total difference),
  and each group's reference moves to the mean of its members, four rounds in all. On the 3×3×3
  the centres start the references and stay in their own groups, so the light's colour cast
  cancels out and the result always has the right centres. The 4×4×4 has no fixed centres: it
  starts from the scheme's display colours and names the groups by the permutation of the six
  colours with the least total difference.
- The result fills the sticker editor, which validates it and lets any sticker be fixed with a
  click. Nothing is solved from a scan unchecked.

## Results

- Synthetic tests (`apps/web/src/camera/colour.test.ts`): stickers rendered with a warm cast
  and ±12 noise per channel, made-up values rather than measurements, are read exactly on a
  scrambled 3×3×3 and 4×4×4 for 20 noise seeds each. Random noise still yields N² stickers of each
  colour and the right 3×3×3 centres.
- In Chrome with a fake camera the whole flow runs: preview, six captures, colours into the
  editor.
- Not yet measured on real cubes and cameras; the Pixel test phone is the next check.

## Consequences

- Balancing makes a single misread sticker show up as a swap between two colours, which the
  editor's piece checks usually catch, rather than as a wrong colour count.
- Without a camera (or without HTTPS) the editor stays as it was; a photo upload fallback could
  reuse the same sampling but is not built.

## Sources

- [sharma] G. Sharma, W. Wu, E. N. Dalal, "The CIEDE2000 Color-Difference Formula: Implementation
  Notes, Supplementary Test Data, and Mathematical Observations", Color Research and Application
  30(1), 2005, Table I. The table was read from a copy in the skinoptics project
  (`skinoptics/datasets/colors/Sharma2004_TableI.txt`); the first pair's 2.0425 agrees with
  independent copies in Open CASCADE's tests (`tpaviot/oce`) and in NeuralImageKit's reference
  file.
