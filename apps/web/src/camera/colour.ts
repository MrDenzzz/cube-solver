import { FACES, type Face } from '@cube/core';

/** CIELAB under D65: lightness 0–100 and the two opponent axes. */
export type Lab = readonly [number, number, number];
/** 8-bit sRGB, as a camera gives it. */
export type Rgb = readonly [number, number, number];

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

// D65 reference white, and the sRGB to XYZ matrix for it, whose rows sum to that white.
const WHITE = [0.95047, 1, 1.08883] as const;
const EPSILON = (6 / 29) ** 3;
const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);

/** 8-bit sRGB to CIELAB (IEC 61966-2-1 transfer curve, CIE 15 definition of L*a*b*). */
export function srgbToLab(red: number, green: number, blue: number): Lab {
  return linearToLab(linear(red), linear(green), linear(blue));
}

/** Linear-light sRGB, 1 being full scale, to CIELAB. */
function linearToLab(r: number, g: number, b: number): Lab {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE[0];
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE[1];
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE[2];
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const DEGREES = 180 / Math.PI;
const radians = (degrees: number) => degrees / DEGREES;
const POW25_7 = 25 ** 7;

function hue(b: number, a: number): number {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) * DEGREES;
  return h < 0 ? h + 360 : h;
}

/**
 * The CIEDE2000 colour difference with unit weights, following the implementation notes of Sharma,
 * Wu and Dalal, whose test pairs the tests use. Unlike plain Lab distance it weighs hue
 * differences among saturated colours more, which is where red and orange stickers differ.
 */
export function ciede2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const meanC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + POW25_7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1 = Math.hypot(a1p, b1);
  const c2 = Math.hypot(a2p, b2);
  const h1 = hue(b1, a1p);
  const h2 = hue(b2, a2p);

  const dL = l2 - l1;
  const dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(radians(dh / 2));

  const meanL = (l1 + l2) / 2;
  const meanCp = (c1 + c2) / 2;
  let meanH = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) meanH = (h1 + h2) / 2;
    else meanH = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos(radians(meanH - 30)) +
    0.24 * Math.cos(radians(2 * meanH)) +
    0.32 * Math.cos(radians(3 * meanH + 6)) -
    0.2 * Math.cos(radians(4 * meanH - 63));
  const dTheta = 30 * Math.exp(-(((meanH - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + POW25_7));
  const sL = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
  const sC = 1 + 0.045 * meanCp;
  const sH = 1 + 0.015 * meanCp * t;
  const rT = -Math.sin(radians(2 * dTheta)) * rC;
  return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH));
}

/**
 * Typical sticker colours, to start from and to name groups by when nothing better is known:
 * the scheme's own display colours.
 */
export function paletteRgb(colours: Readonly<Record<Face, string>>): Record<Face, Rgb> {
  const rgb = {} as Record<Face, Rgb>;
  for (const face of FACES) {
    const hex = colours[face];
    rgb[face] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as unknown as Rgb;
  }
  return rgb;
}

export function paletteLab(colours: Readonly<Record<Face, string>>): Record<Face, Lab> {
  const lab = {} as Record<Face, Lab>;
  for (const [face, [r, g, b]] of Object.entries(paletteRgb(colours))) {
    lab[face as Face] = srgbToLab(r, g, b);
  }
  return lab;
}

const mean = (samples: readonly Lab[]): Lab => {
  let l = 0;
  let a = 0;
  let b = 0;
  for (const [sl, sa, sb] of samples) {
    l += sl;
    a += sa;
    b += sb;
  }
  return [l / samples.length, a / samples.length, b / samples.length];
};

/**
 * Splits samples into six groups of exactly `capacity` each, close to the given references:
 * closest pairs first, then single swaps between groups while they lower the total difference.
 * Samples with a `pinned` group stay in it.
 */
function balancedGroups(
  samples: readonly Lab[],
  references: readonly Lab[],
  capacity: number,
  pinned: ReadonlyMap<number, number>,
) {
  const cost = samples.map((s) => references.map((r) => ciede2000(s, r)));
  const group = samples.map((_, i) => pinned.get(i) ?? -1);
  const filled = references.map((_, g) => group.filter((x) => x === g).length);
  const pairs = cost
    .flatMap((row, i) => row.map((d, g) => ({ i, g, d })))
    .sort((p, q) => p.d - q.d);
  for (const { i, g } of pairs) {
    if (group[i] !== -1 || (filled[g] ?? 0) >= capacity) continue;
    group[i] = g;
    filled[g] = (filled[g] ?? 0) + 1;
  }
  const at = (i: number, g: number) => cost[i]?.[g] ?? 0;
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const gi = group[i] ?? 0;
        const gj = group[j] ?? 0;
        if (gi === gj || pinned.has(i) || pinned.has(j)) continue;
        if (at(i, gj) + at(j, gi) < at(i, gi) + at(j, gj) - 1e-9) {
          group[i] = gj;
          group[j] = gi;
          improved = true;
        }
      }
    }
  }
  return group;
}

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) =>
    Array.from({ length: n }, (_, k) => [...p.slice(0, k), n - 1, ...p.slice(k)]),
  );
}
const SIX_PERMUTATIONS = permutations(6);

/**
 * Face letters for six face pictures, each n² samples in reading order, in the order they were
 * taken. Every colour covers n² stickers, so the samples are split into six groups of that size,
 * refining each group's reference to the mean of its members a few times. On the 3×3×3 each
 * picture's centre is a different colour by definition: the centres are pinned to groups of their
 * own and start the references, which absorbs the light's colour cast. The 4×4×4 has no fixed
 * centres, so it starts from the palette. Either way the groups are named by the assignment to
 * the palette with the least total difference.
 */
export function classifyFaces(
  faces: readonly (readonly Lab[])[],
  size: 3 | 4,
  palette: Readonly<Record<Face, Lab>>,
): string[] {
  const perFace = size * size;
  const samples = faces.flat();
  const pinned = new Map<number, number>(
    size === 3 ? faces.map((_, f) => [f * perFace + 4, f] as const) : [],
  );
  let references: Lab[] = FACES.map(
    (face, f) => (size === 3 ? faces[f]?.[4] : undefined) ?? palette[face],
  );
  let group: number[] = [];
  for (let round = 0; round < 4; round++) {
    group = balancedGroups(samples, references, perFace, pinned);
    references = references.map((_, g) => mean(samples.filter((_, i) => group[i] === g)));
  }
  const names = nameGroups(references, palette);
  const letters = samples.map((_, i) => FACES[names[group[i] ?? 0] ?? 0] ?? 'U').join('');
  return faces.map((_, f) => letters.slice(f * perFace, (f + 1) * perFace));
}

/** Which colour each group's reference is: the assignment to the palette with the least total difference. */
function nameGroups(references: readonly Lab[], palette: Readonly<Record<Face, Lab>>): number[] {
  let names: number[] = FACES.map((_, g) => g);
  let best = Number.POSITIVE_INFINITY;
  for (const p of SIX_PERMUTATIONS) {
    const total = p.reduce(
      (s, face, g) => s + ciede2000(references[g] ?? [0, 0, 0], palette[FACES[face] ?? 'U']),
      0,
    );
    if (total < best) {
      best = total;
      names = p;
    }
  }
  return names;
}

const nearest = (sample: Lab, references: readonly Lab[]) => {
  let best = 0;
  references.forEach((r, g) => {
    if (ciede2000(sample, r) < ciede2000(sample, references[best] ?? r)) best = g;
  });
  return best;
};

/** Rounds of fitting the gains to the colours the samples are nearest to. */
const GAIN_ROUNDS = 8;
/**
 * The largest ratio between two channels' gains. A camera's colour cast stays well within it; a
 * larger one means the samples were fitted to the wrong colours, say a red face to orange.
 */
const MAX_CAST = 2.5;

type Linear = readonly [number, number, number];

const toLinear = ([r, g, b]: Rgb): Linear => [linear(r), linear(g), linear(b)];
/** Relative luminance (the Y of XYZ) of linear sRGB. */
const luminance = ([r, g, b]: Linear) => 0.2126729 * r + 0.7151522 * g + 0.072175 * b;

/**
 * Maps the camera's colours to how the stickers would look under daylight at the palette's
 * brightness. A webcam often exposes for a bright window behind the cube, so that white comes
 * out mid-grey and yellow olive, and its white balance can leave a cast; both are, to a good
 * approximation, a gain on each channel of linear light. The gains are fitted to the samples:
 * each sample is matched to the palette colour it is nearest to, the gains set by least squares
 * to bring the samples onto their colours, and the two repeated. Of a few starting exposures the
 * fit that ends nearest to the palette is kept. With samples of several colours the gains are
 * well determined; a single colour alone is not (dim orange and bright red look alike), which is
 * why all the faces seen so far are fitted together.
 */
export function correction(
  samples: readonly Rgb[],
  palette: Readonly<Record<Face, Rgb>>,
): (rgb: Rgb) => Lab {
  const seen = samples.map(toLinear);
  const targets = FACES.map((face) => toLinear(palette[face]));
  const targetLabs = targets.map((t) => linearToLab(...t));
  const apply = (s: Linear, gains: Linear): Lab =>
    linearToLab(s[0] * gains[0], s[1] * gains[1], s[2] * gains[2]);
  const nearestTarget = (lab: Lab) => {
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    targetLabs.forEach((t, k) => {
      const d = Math.hypot(lab[0] - t[0], lab[1] - t[1], lab[2] - t[2]);
      if (d < distance) {
        best = k;
        distance = d;
      }
    });
    return { best, distance };
  };
  const fit = (start: number) => {
    let gains: Linear = [start, start, start];
    for (let round = 0; round < GAIN_ROUNDS; round++) {
      const assigned = seen.map((s) => targets[nearestTarget(apply(s, gains)).best] ?? s);
      const raw = [0, 1, 2].map((c) => {
        let num = 0;
        let den = 0;
        seen.forEach((s, i) => {
          num += (s[c] ?? 0) * (assigned[i]?.[c] ?? 0);
          den += (s[c] ?? 0) ** 2;
        });
        return den > 0 ? num / den : (gains[c] ?? start);
      });
      const mean = Math.cbrt(raw.reduce((p, g) => p * Math.max(g, 1e-9), 1));
      const limit = Math.sqrt(MAX_CAST);
      gains = raw.map((g) =>
        Math.min(mean * limit, Math.max(mean / limit, g)),
      ) as unknown as Linear;
    }
    const cost = seen.reduce((sum, s) => sum + nearestTarget(apply(s, gains)).distance, 0);
    return { gains, cost };
  };
  const white = luminance(toLinear(palette.U));
  const brightness = seen.map(luminance).sort((a, b) => a - b);
  const brightest = brightness[brightness.length - 1] ?? 0;
  const middle = brightness[Math.floor(brightness.length / 2)] ?? 0;
  const middleTarget = targets.map(luminance).sort((a, b) => a - b)[3] ?? 0;
  // As seen; with the brightest sticker taken for white; with the middle one at the palette's middle.
  const starts = [1, brightest > 0 ? white / brightest : 1, middle > 0 ? middleTarget / middle : 1];
  const best = starts.map(fit).reduce((a, b) => (b.cost < a.cost ? b : a));
  return (rgb) => apply(toLinear(rgb), best.gains);
}

/** The colour whose reference is closest to a sample. */
export function nearestFace(sample: Lab, references: Readonly<Record<Face, Lab>>): Face {
  const faces = FACES;
  return (
    faces[
      nearest(
        sample,
        faces.map((f) => references[f]),
      )
    ] ?? 'U'
  );
}
