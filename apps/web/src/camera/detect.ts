import { sampleAt, type CellColour, type Pixels } from './sample.ts';

// Finds a cube face anywhere in a picture, at any size and tilt, without lining it up with
// anything. Stickers are patches of one colour bounded by dark plastic (cubes with stickers) or
// by a sharp change of colour and the thin seam between pieces (stickerless cubes, whose seams
// are not dark): the picture is split along both, the sticker-shaped patches kept, and a
// size × size lattice looked for among them, seeded by every patch and each of its near
// neighbours. The lattice is then fitted to all its patches by least squares, which also takes
// in a slight perspective, and each sticker is read at its fitted centre. A webcam blurs the seam
// between pieces of similar colour, red and orange say, so neighbours can merge into one patch
// of no sticker's shape: a lattice needs only most of its stickers found, as long as they reach
// every row and column, and each sticker it fills in must lie in such a merged patch.

export type Point = readonly [number, number];

export interface Detection {
  /** Row by row as the face appears on screen, the rows as level as the face allows. */
  readonly cells: readonly CellColour[];
  /** Where each sticker was read, in pixels of the picture. */
  readonly centres: readonly Point[];
  /** The face's corners, for drawing it. */
  readonly outline: readonly Point[];
}

interface Patch {
  readonly x: number;
  readonly y: number;
  readonly area: number;
}

/** Stickers whose middle may vary too much for one colour: a glare spot or a logo can spoil one. */
const MISSING = 1;
/** The share of a face's stickers that must be found as patches; the lattice fills in the rest. */
const FOUND = 0.55;
/** How far, in lattice steps, a patch may lie from a lattice point and still count. */
const TOLERANCE = 0.22;
/** Patches whose areas differ by more than this factor are not stickers of one face. */
const AREA_RATIO = 2.2;
/** Neighbours of a seed tried as the lattice's first step. */
const NEIGHBOURS = 6;
/** A sticker's middle that varies more than this (8-bit channel spread) is no sticker. */
const MAX_SPREAD = 55;
/**
 * A colour change across 2 px larger than this (8-bit, largest channel) separates patches. On a
 * photo of stickerless cubes 30 kept every seam, between pieces of one colour too; 50 lost some.
 */
const EDGE = 30;

/**
 * Pixels no patch may cross: dark plastic (colourless, and black or much darker than its
 * surroundings), and sharp changes of colour.
 */
function barrierMask(pixels: Pixels): Uint8Array {
  const { data, width, height } = pixels;
  const lum = new Float32Array(width * height);
  const chroma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  // Local mean brightness through an integral image.
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += lum[y * width + x] ?? 0;
      integral[(y + 1) * stride + x + 1] = (integral[y * stride + x + 1] ?? 0) + row;
    }
  }
  const radius = Math.max(3, Math.round(Math.min(width, height) / 30));
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum =
        (integral[y1 * stride + x1] ?? 0) -
        (integral[y0 * stride + x1] ?? 0) -
        (integral[y1 * stride + x0] ?? 0) +
        (integral[y0 * stride + x0] ?? 0);
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const i = y * width + x;
      const l = lum[i] ?? 0;
      const dark = (chroma[i] ?? 0) < 45 && (l < 45 || l < 0.55 * mean);
      mask[i] = dark || edgeAt(pixels, x, y) > EDGE ? 1 : 0;
    }
  }
  return mask;
}

/** The largest change of a channel across the pixel, left to right plus top to bottom. */
function edgeAt({ data, width, height }: Pixels, x: number, y: number): number {
  const left = (y * width + Math.max(0, x - 1)) * 4;
  const right = (y * width + Math.min(width - 1, x + 1)) * 4;
  const up = (Math.max(0, y - 1) * width + x) * 4;
  const down = (Math.min(height - 1, y + 1) * width + x) * 4;
  let largest = 0;
  for (let c = 0; c < 3; c++) {
    const change =
      Math.abs((data[right + c] ?? 0) - (data[left + c] ?? 0)) +
      Math.abs((data[down + c] ?? 0) - (data[up + c] ?? 0));
    largest = Math.max(largest, change);
  }
  return largest;
}

/** A region's area, centre and spread along its two principal axes. */
interface Region extends Patch {
  /** Variances along the major and minor axes, and the major axis's direction. */
  readonly major: number;
  readonly minor: number;
  readonly angle: number;
}

/** The picture split into regions between barriers. */
interface Segmentation {
  readonly regions: readonly Region[];
  /** Each pixel's region, -1 on a barrier. */
  readonly labels: Int32Array;
}

/** The connected regions between barriers, with their shape moments. */
function segment(pixels: Pixels): Segmentation {
  const { width, height } = pixels;
  const barrier = barrierMask(pixels);
  const labels = new Int32Array(width * height).fill(-1);
  const stack = new Int32Array(width * height);
  const found: Region[] = [];
  for (let start = 0; start < width * height; start++) {
    if (barrier[start] === 1 || labels[start] !== -1) continue;
    const label = found.length;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    while (top > 0) {
      const i = stack[--top] ?? 0;
      const x = i % width;
      const y = (i - x) / width;
      area++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (j < 0 || j >= width * height || labels[j] !== -1 || barrier[j] === 1) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === width - 1)) continue;
        labels[j] = label;
        stack[top++] = j;
      }
    }
    const x = sx / area;
    const y = sy / area;
    const cxx = sxx / area - x * x;
    const cyy = syy / area - y * y;
    const cxy = sxy / area - x * y;
    const mid = (cxx + cyy) / 2;
    const root = Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy);
    found.push({
      x,
      y,
      area,
      major: mid + root,
      minor: Math.max(1e-6, mid - root),
      angle: Math.atan2(2 * cxy, cxx - cyy) / 2,
    });
  }
  return { regions: found, labels };
}

/**
 * Sticker-shaped patches: regions shaped like a filled rectangle or disc (a uniform rectangle of
 * sides a, b has variances a²/12 and b²/12 along its axes, so its area is close to 12·√(major ·
 * minor)), roughly square. A run of k stickers of one colour whose seams were too faint to split
 * them is cut into k along its long axis: such a region is k times as long as wide and k times
 * the area of a single sticker.
 */
function stickerPatches(pixels: Pixels, regions: readonly Region[], size: number): Patch[] {
  const short = Math.min(pixels.width, pixels.height);
  const unit = (short / size) ** 2;
  const minArea = (short * 0.03) ** 2;
  const shaped = regions.filter((r) => {
    if (r.area < minArea || r.area > unit * size) return false;
    const fill = r.area / (12 * Math.sqrt(r.major * r.minor));
    return fill > 0.75 && fill < 1.3;
  });
  const square = shaped.filter((r) => r.major / r.minor < 1.8 && r.area <= unit);
  if (square.length === 0) return [];
  const areas = square.map((r) => r.area).sort((a, b) => a - b);
  const typical = areas[Math.floor(areas.length / 2)] ?? 0;
  const patches: Patch[] = square.map(({ x, y, area }) => ({ x, y, area }));
  for (const r of shaped) {
    const k = Math.round(Math.sqrt(r.major / r.minor));
    if (k < 2 || k > size || r.area < typical * k * 0.7 || r.area > typical * k * 1.4) continue;
    const length = Math.sqrt(12 * r.major);
    for (let t = 0; t < k; t++) {
      const offset = (t - (k - 1) / 2) * (length / k);
      patches.push({
        x: r.x + Math.cos(r.angle) * offset,
        y: r.y + Math.sin(r.angle) * offset,
        area: r.area / k,
      });
    }
  }
  return patches;
}

interface Lattice {
  /** Patches by lattice cell, column then row, within the size × size window. */
  readonly members: readonly { readonly i: number; readonly j: number; readonly p: Patch }[];
  readonly residual: number;
}

/** The size × size lattice holding the most patches, or null if none holds nearly all. */
function findLattice(patches: readonly Patch[], size: number): Lattice | null {
  let best: Lattice | null = null;
  const similar = (a: Patch, b: Patch) =>
    Math.max(a.area, b.area) / Math.min(a.area, b.area) <= AREA_RATIO;
  for (const seed of patches) {
    const side = Math.sqrt(seed.area);
    const near = patches
      .filter((p) => p !== seed && similar(p, seed))
      .map((p) => ({ p, d: Math.hypot(p.x - seed.x, p.y - seed.y) }))
      .filter(({ d }) => d > side * 0.9 && d < side * 2.2)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBOURS);
    for (const { p: step } of near) {
      // The lattice's first step, and the second a quarter turn clockwise on screen.
      const ux = step.x - seed.x;
      const uy = step.y - seed.y;
      const length = ux * ux + uy * uy;
      const cells = new Map<string, { i: number; j: number; p: Patch; error: number }>();
      for (const p of patches) {
        if (!similar(p, seed)) continue;
        const dx = p.x - seed.x;
        const dy = p.y - seed.y;
        const i = (dx * ux + dy * uy) / length;
        const j = (-dx * uy + dy * ux) / length;
        const ri = Math.round(i);
        const rj = Math.round(j);
        const error = Math.hypot(i - ri, j - rj);
        if (Math.abs(i - ri) > TOLERANCE || Math.abs(j - rj) > TOLERANCE) continue;
        const key = `${String(ri)},${String(rj)}`;
        const held = cells.get(key);
        if (held === undefined || error < held.error) cells.set(key, { i: ri, j: rj, p, error });
      }
      const found = [...cells.values()];
      const tried = new Set<string>();
      for (const corner of found) {
        // Windows whose top-left corner is a found cell or lies just before one.
        for (let oi = 0; oi < size; oi++) {
          for (let oj = 0; oj < size; oj++) {
            const i0 = corner.i - oi;
            const j0 = corner.j - oj;
            const key = `${String(i0)},${String(j0)}`;
            if (tried.has(key)) continue;
            tried.add(key);
            const members = found.filter(
              (c) => c.i >= i0 && c.i < i0 + size && c.j >= j0 && c.j < j0 + size,
            );
            if (members.length < Math.ceil(FOUND * size * size)) continue;
            // Found stickers in every row and column pin the window to the face.
            const rows = new Set(members.map((c) => c.j));
            const columns = new Set(members.map((c) => c.i));
            if (rows.size < size || columns.size < size) continue;
            // A window inside a larger grid is part of a bigger face, such as a 4×4×4 when a
            // 3×3×3 is wanted.
            const outside = found.filter(
              (c) =>
                (c.i === i0 - 1 || c.i === i0 + size || c.j === j0 - 1 || c.j === j0 + size) &&
                c.i >= i0 - 1 &&
                c.i <= i0 + size &&
                c.j >= j0 - 1 &&
                c.j <= j0 + size,
            );
            if (outside.length >= size) continue;
            const residual = members.reduce((s, c) => s + c.error, 0);
            if (
              best === null ||
              members.length > best.members.length ||
              (members.length === best.members.length && residual < best.residual)
            ) {
              best = {
                members: members.map((c) => ({ i: c.i - i0, j: c.j - j0, p: c.p })),
                residual,
              };
            }
          }
        }
      }
    }
  }
  return best;
}

/** Least squares for an origin and two steps: centre ≈ origin + i·U + j·V. */
function fitAffine(members: Lattice['members']): { o: Point; u: Point; v: Point } {
  // Normal equations, shared by x and y: [n Σi Σj; Σi Σii Σij; Σj Σij Σjj].
  let n = 0;
  let si = 0;
  let sj = 0;
  let sii = 0;
  let sij = 0;
  let sjj = 0;
  const rhs = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const { i, j, p } of members) {
    n++;
    si += i;
    sj += j;
    sii += i * i;
    sij += i * j;
    sjj += j * j;
    for (const [axis, value] of [p.x, p.y].entries()) {
      const r = rhs[axis] ?? [0, 0, 0];
      r[0] = (r[0] ?? 0) + value;
      r[1] = (r[1] ?? 0) + value * i;
      r[2] = (r[2] ?? 0) + value * j;
    }
  }
  const m = [
    [n, si, sj],
    [si, sii, sij],
    [sj, sij, sjj],
  ];
  const det = (a: number[][]) =>
    (a[0]?.[0] ?? 0) * ((a[1]?.[1] ?? 0) * (a[2]?.[2] ?? 0) - (a[1]?.[2] ?? 0) * (a[2]?.[1] ?? 0)) -
    (a[0]?.[1] ?? 0) * ((a[1]?.[0] ?? 0) * (a[2]?.[2] ?? 0) - (a[1]?.[2] ?? 0) * (a[2]?.[0] ?? 0)) +
    (a[0]?.[2] ?? 0) * ((a[1]?.[0] ?? 0) * (a[2]?.[1] ?? 0) - (a[1]?.[1] ?? 0) * (a[2]?.[0] ?? 0));
  const d = det(m);
  // Cramer's rule, one unknown at a time.
  const solve = (b: number[]) =>
    [0, 1, 2].map(
      (k) => det(m.map((row, r) => row.map((x, c) => (c === k ? (b[r] ?? 0) : x)))) / d,
    );
  const [ox = 0, ux = 0, vx = 0] = solve(rhs[0] ?? []);
  const [oy = 0, uy = 0, vy = 0] = solve(rhs[1] ?? []);
  return { o: [ox, oy], u: [ux, uy], v: [vx, vy] };
}

/** The face in the picture, or null if there is none to read. */
export function detectFace(pixels: Pixels, size: number): Detection | null {
  const { regions, labels } = segment(pixels);
  const lattice = findLattice(stickerPatches(pixels, regions, size), size);
  if (lattice === null) return null;
  const missing = size * size - lattice.members.length;
  const areas = lattice.members.map(({ p }) => p.area).sort((a, b) => a - b);
  const typical = areas[Math.floor(areas.length / 2)] ?? 0;
  /**
   * Whether a sticker the lattice filled in lies in a patch that holds no more than the missing
   * stickers, such as neighbours merged across a blurred seam, rather than in the background:
   * the patch most of the sticker's middle belongs to, since a logo can cover its very centre.
   */
  const filledIn = ([x, y]: Point, half: number) => {
    const count = new Map<number, number>();
    for (let py = Math.round(y - half); py <= y + half; py++) {
      for (let px = Math.round(x - half); px <= x + half; px++) {
        const label = labels[py * pixels.width + px] ?? -1;
        if (label !== -1) count.set(label, (count.get(label) ?? 0) + 1);
      }
    }
    let label = -1;
    for (const [l, n] of count) if (n > (count.get(label) ?? 0)) label = l;
    const area = regions[label]?.area ?? Number.POSITIVE_INFINITY;
    return area <= (missing + 1) * typical;
  };
  const { o, u, v } = fitAffine(lattice.members);
  // Read the face as it appears on screen: of the lattice's four quarter turns, the one whose
  // columns run most nearly left to right, rows below them.
  const middle = (size - 1) / 2;
  const centre: Point = [o[0] + middle * (u[0] + v[0]), o[1] + middle * (u[1] + v[1])];
  const negate = ([x, y]: Point): Point => [-x, -y];
  const frames: readonly (readonly [Point, Point])[] = [
    [u, v],
    [v, negate(u)],
    [negate(u), negate(v)],
    [negate(v), u],
  ];
  const [across, down] = frames.reduce((best, frame) =>
    frame[0][0] / Math.hypot(...frame[0]) > best[0][0] / Math.hypot(...best[0]) ? frame : best,
  );
  const at = (i: number, j: number): Point => [
    centre[0] + (i - middle) * across[0] + (j - middle) * down[0],
    centre[1] + (i - middle) * across[1] + (j - middle) * down[1],
  ];
  const step = Math.min(Math.hypot(...u), Math.hypot(...v));
  const half = Math.max(1, 0.18 * step);
  const centres: Point[] = [];
  const cells: CellColour[] = [];
  let uneven = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const point = at(i, j);
      if (point[0] < 0 || point[1] < 0 || point[0] >= pixels.width || point[1] >= pixels.height) {
        return null;
      }
      const middle = sampleAt(pixels, point[0], point[1], half);
      // A logo can cover all of a centre's middle: a square twice the size takes in enough of
      // the sticker around it to be its dominant colour.
      const cell =
        middle.spread > MAX_SPREAD ? sampleAt(pixels, point[0], point[1], 2 * half) : middle;
      const found = lattice.members.some(
        ({ p }) => Math.hypot(p.x - point[0], p.y - point[1]) < 0.35 * step,
      );
      if (!found && !filledIn(point, half)) return null;
      if (middle.spread > MAX_SPREAD) uneven++;
      centres.push(point);
      cells.push(cell);
    }
  }
  if (uneven > MISSING) return null;
  const outline = [
    at(-0.5, -0.5),
    at(size - 0.5, -0.5),
    at(size - 0.5, size - 0.5),
    at(-0.5, size - 0.5),
  ];
  return { cells, centres, outline };
}
