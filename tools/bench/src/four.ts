import { applyLayerTurns4, isSolved4, randomCube4, Xoshiro128StarStar } from '@cube/core';
import {
  buildEdgePairing,
  buildReductionTables,
  buildTwoPhaseTables,
  createReductionSolver,
  createTwoPhaseSolver,
} from '@cube/solver-ts';
import { writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    count: { type: 'string', default: '100' },
    seed: { type: 'string', default: '1' },
    'phase1-candidates': { type: 'string', default: '200' },
    'phase2-candidates': { type: 'string', default: '100' },
    'phase3-candidates': { type: 'string', default: '4' },
    'finish-time': { type: 'string', default: '50' },
    warmup: { type: 'string', default: '3' },
    label: { type: 'string', default: 'reduction-ts' },
    json: { type: 'string' },
    markdown: { type: 'string' },
  },
});

const count = Number(args.count);
const seed = Number(args.seed);
const warmup = Number(args.warmup);
const options = {
  phase1Candidates: Number(args['phase1-candidates']),
  phase2Candidates: Number(args['phase2-candidates']),
  phase3Candidates: Number(args['phase3-candidates']),
  finishTimeMs: Number(args['finish-time']),
};

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (position - lower);
}

const mean = (values: readonly number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const timed = <T>(build: () => T): [T, number] => {
  const start = performance.now();
  const value = build();
  return [value, performance.now() - start];
};
const [reductionTables, reductionMs] = timed(() => buildReductionTables());
const [edgeTable, edgeMs] = timed(() => buildEdgePairing());
const [twoPhaseTables, twoPhaseMs] = timed(() => buildTwoPhaseTables());
const solve = createReductionSolver(
  reductionTables,
  edgeTable,
  createTwoPhaseSolver(twoPhaseTables),
);

// Warm-up cubes come from a different seed so the measured set stays fixed.
const warmupRng = Xoshiro128StarStar.fromSeed(seed + 1_000_000);
for (let i = 0; i < warmup; i++) solve(randomCube4(warmupRng), options);

interface Sample {
  readonly index: number;
  readonly length: number;
  readonly phases: readonly number[];
  readonly ms: number;
}

const rng = Xoshiro128StarStar.fromSeed(seed);
const samples: Sample[] = [];
for (let index = 0; index < count; index++) {
  const cube = randomCube4(rng);
  const start = performance.now();
  const result = solve(cube, options);
  const ms = performance.now() - start;
  const moves = result.moves ?? [];
  if (result.moves === undefined || !isSolved4(applyLayerTurns4(cube, moves))) {
    throw new Error(`Cube ${String(index)}: the returned solution does not solve the cube`);
  }
  samples.push({ index, length: moves.length, phases: result.phases, ms });
}

const times = samples.map((s) => s.ms).sort((a, b) => a - b);
const lengths = samples.map((s) => s.length);
const histogram: Record<string, number> = {};
for (const length of lengths) histogram[length] = (histogram[length] ?? 0) + 1;
const phaseMeans = [0, 1, 2, 3].map((p) => round(mean(samples.map((s) => s.phases[p] ?? 0)), 2));

const report = {
  label: args.label,
  date: new Date().toISOString(),
  machine: {
    cpu: cpus()[0]?.model.trim(),
    cores: cpus().length,
    os: `${platform()} ${release()}`,
    node: process.version,
  },
  settings: { count, seed, warmup, ...options },
  tables: {
    reductionMs: round(reductionMs, 1),
    reductionMegabytes: round(reductionTables.bytes / 2 ** 20),
    edgePairingMs: round(edgeMs, 1),
    edgePairingMegabytes: round(edgeTable.prune.byteLength / 2 ** 20),
    twoPhaseMs: round(twoPhaseMs, 1),
  },
  summary: {
    meanLength: round(mean(lengths)),
    maxLength: Math.max(...lengths),
    lengthHistogram: histogram,
    meanPhaseLengths: phaseMeans,
    meanMs: round(mean(times)),
    medianMs: round(quantile(times, 0.5)),
    p95Ms: round(quantile(times, 0.95)),
    maxMs: round(times.at(-1) ?? Number.NaN),
  },
  samples: samples.map((s) => ({ ...s, ms: round(s.ms, 1) })),
};

const s = report.summary;
const settings = `${String(options.phase2Candidates)} / ${String(options.phase3Candidates)} / ${String(options.finishTimeMs)} ms`;
const markdown = [
  `| Engine | Candidates (phase 2 / 3) / finish | Cubes | Mean length | Phases | Mean ms | Median ms | p95 ms | Max ms |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  `| ${report.label} | ${settings} | ${String(count)} | ${String(s.meanLength)} | ${phaseMeans.join(' + ')} | ${String(s.meanMs)} | ${String(s.medianMs)} | ${String(s.p95Ms)} | ${String(s.maxMs)} |`,
].join('\n');

console.log(markdown);
console.log(
  `\nLengths: ${JSON.stringify(histogram)}  tables: reduction ${String(report.tables.reductionMs)} ms, edges ${String(report.tables.edgePairingMs)} ms, two-phase ${String(report.tables.twoPhaseMs)} ms  machine: ${String(report.machine.cpu)}, Node ${process.version}`,
);
if (args.json !== undefined) writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
if (args.markdown !== undefined) writeFileSync(args.markdown, `${markdown}\n`);
