# 0009. Camera input: faces found anywhere, in any order, named by balanced groups and placed by a search

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

- **Finding the face.** No grid to line up with: the whole frame, scaled to 400 px on its longer
  side, is split into patches along barriers, which are dark colourless plastic (cubes with
  stickers) and colour changes of more than 30 per channel across 2 px (stickerless cubes, whose
  seams between pieces are not dark). Patches shaped like a filled rectangle or disc and roughly
  square are stickers; a run of k pieces of one colour whose seams were too faint, k times as
  long as wide and k times a sticker's area, is cut into k. A size × size lattice is then looked
  for among them, seeded by every patch and each of its near neighbours; a lattice with stickers
  beyond its sides is part of a larger face and refused, so a 4×4×4 is not read as a 3×3×3. A
  webcam blurs the seam between pieces of similar colour: on the first real frame, from a
  Logitech C270, an orange centre ran into the two reds beside it as one L-shaped patch of no
  sticker's shape, and with only one sticker allowed missing the face was never found. So a
  lattice needs 55 % of its stickers found (5 of 9, 9 of 16), in every row and column so that
  they pin it to the face, and most of each filled-in sticker's middle must lie in a patch no
  larger than one more than the missing stickers, not in the background or on a seam. One
  sticker in a face may read as no even colour, for glare or a logo: on a second C270 frame, of
  a stickerless 4×4×4, four white pieces ran into one patch and the logo on one of them left its
  centre uneven, which an earlier rule, that filled-in stickers read evenly, refused. The
  lattice is fitted by least squares, which takes in a slight perspective, and each sticker's
  middle is read as the per-channel median, which ignores glare. The face is read as it appears on screen, rows left to right; the preview is not
  mirrored. On a photo of the author's two stickerless cubes this found all 16 and all 9 pieces
  in 16 and 34 ms, colours in the right places; a fixed grid, the first design, never took a
  face by itself on that camera, since a face held by hand never lined up with it.
- **Choosing the camera.** On a phone or tablet (a coarse pointer) the rear camera is asked for;
  on a computer, the browser's own choice, and a camera picked from the list is remembered. No
  size is asked for: the camera's own is plenty for a grid read at 240 px. On a desktop with seven
  cameras (a phone linked as a Windows camera, headset and virtual cameras), asking for 1280×720
  made the webcam fail to start with `NotReadableError`; applied to the running stream instead,
  it stopped the webcam after a second and left it held by the browser until the tab closed;
  and asking for a rear camera picked one that sent no picture. Chrome's own preview, at the
  default size, worked throughout. If a picked camera is gone or the first choice will not
  start, the browser's default is asked. A camera that still fails, stops, or sends no picture
  within 4 s or only black for 3 s gets an explanation, a button to try again and the list.
- **Taking a face by itself.** A face is taken when it is found in three readings in a row
  (8 a second) whose colours agree, in any rotation, about 0.4 s of holding still. A face matching
  one already taken, in any rotation, is not taken again. While searching, the found face is
  outlined and each sticker marked in the colour it will most likely be named, from everything
  seen so far. A button takes the found face at once, even one that looks taken already, and a
  tap on a thumbnail removes it. With `?debug` in the address the camera's frame can be saved,
  to collect real frames for tests.
- **Colour difference.** Samples are compared in CIELAB (D65) with CIEDE2000, which weighs hue
  differences among saturated colours more than plain Lab distance does. The implementation
  reproduces all 34 test pairs of Sharma, Wu and Dalal to four decimals [sharma].
- **Correcting the camera.** The C270 exposed for a bright window behind the cube: white came
  out mid-grey (116, 113, 110) and yellow olive (115, 107, 0), and the stickers shown while
  scanning were named green. A webcam's exposure and white balance are, to a good approximation,
  a gain on each channel of linear light, so three gains are fitted to everything seen so far:
  each sample is matched to the nearest sticker colour, the gains set by least squares to bring
  the samples onto their colours, and the two repeated eight times, from three starting
  exposures, keeping the fit nearest to the colours. The gains may differ by at most 2.5 times,
  more than a camera's cast, so a red face alone is not fitted to orange.
- **Colours as a camera sees them.** Stickers are named by colours read off real plastic, not by
  the scheme's display colours: a camera's red is nearer the display orange than the display
  red, its yellow leans to green and its blue is lighter. The six were measured on two cameras
  and three cubes.
- **Naming the colours.** Only after all six faces, on the corrected colours: the samples are split into six groups of
  exactly N² each (closest pairs first, then swaps between groups while they lower the total
  difference), and each group's reference moves to the mean of its members, four rounds in all.
  On the 3×3×3 each picture's centre starts a group and stays in it, so the light's colour cast
  cancels out and the six centres are always different. The 4×4×4 starts from the camera
  colours. Either way the groups are named by the permutation of the six colours with
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

- Finding the face (`detect.test.ts`): rendered 3×3×3 and 4×4×4 faces upright, turned by 20° and
  40°, small and off to one side, and filling most of the picture, among coloured clutter, and
  stickerless faces whose same-coloured neighbours are split only by a slightly darker seam, are
  all read sticker for sticker; a room without a cube and a face mostly out of the picture give
  nothing, and a 4×4×4 face gives no 3×3×3.
- Synthetic stickers with a warm cast and ±12 noise per channel, made-up values rather than
  measurements, are named exactly on a scrambled 3×3×3 and 4×4×4 for 20 noise seeds each; random
  noise still yields N² stickers of each colour.
- End to end: Chrome's fake camera plays rendered videos of a 3×3×3 and a 4×4×4 brought into the
  grid face by face, in a mixed order and rotation. Both scans finish by themselves in about 15 s
  of video and give the exact stickers, on a desktop and a phone viewport.
- Real frames: two from the C270 (a stickerless 3×3×3 and 4×4×4 held against a window) and a
  phone photo of a stickerless 4×4×4 and 3×3×3 under a lamp. Before these changes neither webcam
  face was found, and the 3×3×3's stickers, read by the display colours, came out three of nine
  wrong; now each face is found in 15–20 ms, and all 9 + 16 + 16 + 9 stickers are named right.
  `colour.test.ts` keeps the measured colours and `detect.test.ts` the two ways a face was
  missed, redrawn (not the pictures). Four faces from two cameras are few; frames saved with
  `?debug` are the way to add more.

## Consequences

- Balancing makes a single misread sticker show up as a swap between two colours, which the
  placement and the editor's piece checks usually catch, rather than as a wrong colour count.
- A stickerless cube whose pieces show no dark gaps at all would not be taken by itself; the
  button still takes it.
- The camera colours are a measurement on two cameras; a camera that reads very differently
  still gets the full scan right on the 3×3×3, whose centres start the groups, but may show some
  stickers in the wrong colour while scanning.
- Without a camera (or without HTTPS) the editor stays as it was; a photo upload fallback could
  reuse the same reading but is not built.

## Sources

- [sharma] G. Sharma, W. Wu, E. N. Dalal, "The CIEDE2000 Color-Difference Formula: Implementation
  Notes, Supplementary Test Data, and Mathematical Observations", Color Research and Application
  30(1), 2005, Table I. The table was read from a copy in the skinoptics project
  (`skinoptics/datasets/colors/Sharma2004_TableI.txt`); the first pair's 2.0425 agrees with
  independent copies in Open CASCADE's tests (`tpaviot/oce`) and in NeuralImageKit's reference
  file.
