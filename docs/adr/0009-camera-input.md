# 0009. Camera input: faces in any order, CIEDE2000, balanced groups and a placement search

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

- Typing 54 or 96 stickers is the slowest part of solving a real cube, and on a phone the 4×4×4
  net leaves stickers about 16 px wide (ADR 0008).
- The easiest way to scan is to turn the cube in front of the camera without pressing anything
  and without keeping to an order: the app has to notice a face, take it once, and work out
  afterwards where each picture belongs and which way up it was.
- Sticker colours on camera vary with the light: warm bulbs push white towards yellow, and red
  and orange stickers differ mainly in hue. Fixed thresholds on RGB or HSV values break as soon
  as the light changes.
- A cube's colours are constrained: each of the six covers exactly one face's worth of stickers,
  and on the 3×3×3 each centre is, by definition, its face's colour.

## Decision

- **Reading the picture.** The rear camera (`facingMode: environment`) where there is one, at up
  to 1280×720, with a grid over the centred square of 70 % of the frame's shorter side, read 8
  times a second at 240 px. Each cell's middle 40 % is reduced to the per-channel median, which
  ignores glare spots. The preview is not mirrored, so a picture's left is the face's left.
  The camera is opened with no size in mind and the size asked for afterwards: as a wish when
  opening, a size makes Chrome prefer whichever camera offers it, which on a computer with
  virtual cameras picked one that was not running and failed with `NotReadableError` (seen on
  a desktop with seven cameras). If the first choice still fails, the browser's default camera
  is asked; if that fails too, the panel explains the likely causes and offers to try again and
  to pick a camera.
- **Taking a face by itself.** A face is taken when every cell but one is one colour (the 10th
  to 90th percentile spread of each channel stays under 45), at least 60 % of the borders between
  cells have a dark line across them (the gaps between pieces; a wall or a face half out of the
  grid has none), and three readings in a row agree, about 0.4 s. A face matching one already
  taken, in any rotation, is not taken again. A button takes one at once, and a tap on a
  thumbnail removes it.
- **Colour difference.** Samples are compared in CIELAB (D65) with CIEDE2000, which weighs hue
  differences among saturated colours more than plain Lab distance does. The implementation
  reproduces all 34 test pairs of Sharma, Wu and Dalal to four decimals [sharma].
- **Naming the colours.** Only after all six faces: the samples are split into six groups of
  exactly N² each (closest pairs first, then swaps between groups while they lower the total
  difference), and each group's reference moves to the mean of its members, four rounds in all.
  On the 3×3×3 each picture's centre starts a group and stays in it, so the light's colour cast
  cancels out and the six centres are always different. The 4×4×4 starts from the scheme's
  display colours. Either way the groups are named by the permutation of the six colours with
  the least total difference.
- **Placing the pictures.** A backtracking search puts them on the cube one at a time and checks
  each piece as soon as all its stickers are down: a corner must exist and not be mirrored, an
  edge must not show two equal or opposite colours. On the 3×3×3 the centres say where each
  picture goes and only the rotations are searched; on the 4×4×4 the first picture becomes the
  front as taken, which fixes the orientation, and the other five are placed around it among
  5! · 4⁵ = 122,880 arrangements. When nothing fits, a few broken pieces are allowed, so a misread
  sticker still lets the rest fall into place; among equals, an arrangement that is a whole valid
  cube wins.
- The result fills the sticker editor, which validates it and lets any sticker be fixed with a
  click; when the pictures fit more than one way, it says so. Nothing is solved from a scan
  unchecked.
- A cube scanned in any orientation needs a hold the person can find again: on the 4×4×4 the
  guide names the corner at the top front right and the colour on each of its sides (ADR 0008).

## Results

- Placement, 300 random 4×4×4 states each, faces in random order and rotation, with misreads made
  the way the balanced grouping makes them (two stickers swapping colours):

  | Misread pairs | Time per cube | Arrangements tried (mean / max) | Placed right | Unambiguous |
  | ------------- | ------------- | ------------------------------- | ------------ | ----------- |
  | 0             | 0.5 ms        | 253 / 473                       | 300 / 300    | 299 / 300   |
  | 1             | 2.4 ms        | 1,567 / 6,443                   | 299 / 300    | 291 / 300   |
  | 2             | 8.4 ms        | 5,474 / 32,681                  | 299 / 300    | 282 / 300   |

  A random triple of colours is a real corner about one time in nine, which is why so few of the
  122,880 arrangements are looked at. (Measured with a prototype of `placement.ts` in Node on the
  machine of ADR 0007; `placement.test.ts` keeps the cases.)

- Synthetic stickers with a warm cast and ±12 noise per channel, made-up values rather than
  measurements, are named exactly on a scrambled 3×3×3 and 4×4×4 for 20 noise seeds each; random
  noise still yields N² stickers of each colour.
- End to end: Chrome's fake camera plays rendered videos of a 3×3×3 and a 4×4×4 brought into the
  grid face by face, in a mixed order and rotation. Both scans finish by themselves in about 15 s
  of video and give the exact stickers, on a desktop and a phone viewport.
- Not yet measured on real cubes, cameras and light; the Pixel test phone is the next check.

## Consequences

- Balancing makes a single misread sticker show up as a swap between two colours, which the
  placement and the editor's piece checks usually catch, rather than as a wrong colour count.
- A stickerless cube whose pieces show no dark gaps would not be taken by itself; the button
  still takes it.
- Without a camera (or without HTTPS) the editor stays as it was; a photo upload fallback could
  reuse the same reading but is not built.

## Sources

- [sharma] G. Sharma, W. Wu, E. N. Dalal, "The CIEDE2000 Color-Difference Formula: Implementation
  Notes, Supplementary Test Data, and Mathematical Observations", Color Research and Application
  30(1), 2005, Table I. The table was read from a copy in the skinoptics project
  (`skinoptics/datasets/colors/Sharma2004_TableI.txt`); the first pair's 2.0425 agrees with
  independent copies in Open CASCADE's tests (`tpaviot/oce`) and in NeuralImageKit's reference
  file.
