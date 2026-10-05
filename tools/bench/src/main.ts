import { applyFaceTurns, isSolved, randomCube, Xoshiro128StarStar } from '@cube/core';
import { buildTwoPhaseTables, createTwoPhaseSolver, type TableBuildStep } from '@cube/solver-ts';
import { writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    count: { type: 'string', default: '100' },
    seed: { type: 'string', default: '1' },
    'max-length': { type: 'string', default: '20' },
    'time-limit': { type: 'string', default: '10000' },
    warmup: { type: 'string', default: '5' },
    directions: { type: 'string', default: '6' },
    label: { type: 'string', default: 'two-phase-ts' },
    json: { type: 'string' },
    markdown: { type: 'string' },
  },
});

const count = Number(args.count);
const seed = Number(args.seed);
const maxLength = Number(args['max-length']);
const timeLimitMs = Number(args['time-limit']);
const warmup = Number(args.warmup);
const directions = args.directions === '1' ? 1 : 6;

interface Sample {
  readonly index: number;
  readonly length: number;
  readonly ms: number;
  readonly nodes: number;
  readonly stoppedBy: string;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (position - lower);
}

const mean = (values: readonly number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const tableSteps: TableBuildStep[] = [];
const initStart = performance.now();
const tables = buildTwoPhaseTables((step) => tableSteps.push(step));
const initMs = performance.now() - initStart;
const solve = createTwoPhaseSolver(tables);

// Warm-up cubes come from a different seed so the measured set stays fixed.
const warmupRng = Xoshiro128StarStar.fromSeed(seed + 1_000_000);
for (let i = 0; i < warmup; i++)
  solve(randomCube(warmupRng), { maxLength, timeLimitMs, directions });

const rng = Xoshiro128StarStar.fromSeed(seed);
const samples: Sample[] = [];
for (let index = 0; index < count; index++) {
  const cube = randomCube(rng);
  const result = solve(cube, { maxLength, timeLimitMs, directions });
  const moves = result.moves ?? [];
  if (!isSolved(applyFaceTurns(cube, moves))) {
    throw new Error(`Cube ${String(index)}: the returned solution does not solve the cube`);
  }
  const { phase1Nodes, phase2Nodes, elapsedMs } = result.stats;
  samples.push({
    index,
    length: moves.length,
    ms: elapsedMs,
    nodes: phase1Nodes + phase2Nodes,
    stoppedBy: result.stoppedBy,
  });
}

const times = samples.map((s) => s.ms).sort((a, b) => a - b);
const lengths = samples.map((s) => s.length);
const histogram: Record<string, number> = {};
for (const length of lengths) histogram[length] = (histogram[length] ?? 0) + 1;
const totalNodes = samples.reduce((s, x) => s + x.nodes, 0);
const totalMs = samples.reduce((s, x) => s + x.ms, 0);

const report = {
  label: args.label,
  date: new Date().toISOString(),
  machine: {
    cpu: cpus()[0]?.model.trim(),
    cores: cpus().length,
    os: `${platform()} ${release()}`,
    node: process.version,
  },
  settings: { count, seed, maxLength, timeLimitMs, warmup, directions },
  tables: {
    initMs: round(initMs, 1),
    megabytes: round(tableSteps.reduce((s, t) => s + t.bytes, 0) / 2 ** 20),
    steps: tableSteps.map((t) => ({ ...t, ms: round(t.ms, 1) })),
  },
  summary: {
    meanLength: round(mean(lengths)),
    maxLength: Math.max(...lengths),
    lengthHistogram: histogram,
    reachedTarget: samples.filter((s) => s.stoppedBy === 'target').length,
    meanMs: round(mean(times)),
    medianMs: round(quantile(times, 0.5)),
    p95Ms: round(quantile(times, 0.95)),
    maxMs: round(times.at(-1) ?? Number.NaN),
    meanNodes: Math.round(totalNodes / count),
    nodesPerSecond: Math.round(totalNodes / (totalMs / 1000)),
  },
  samples: samples.map((s) => ({ ...s, ms: round(s.ms, 3) })),
};

const s = report.summary;
const markdown = [
  `| Engine | Target | Cubes | Mean length | Reached target | Mean ms | Median ms | p95 ms | Max ms | Nodes/s | Tables | Init ms |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  `| ${report.label} | ≤ ${String(maxLength)} | ${String(count)} | ${String(s.meanLength)} | ${String(s.reachedTarget)}/${String(count)} | ${String(s.meanMs)} | ${String(s.medianMs)} | ${String(s.p95Ms)} | ${String(s.maxMs)} | ${s.nodesPerSecond.toLocaleString('en-US')} | ${String(report.tables.megabytes)} MB | ${String(report.tables.initMs)} |`,
].join('\n');

console.log(markdown);
console.log(
  `\nLengths: ${JSON.stringify(histogram)}  machine: ${String(report.machine.cpu)}, Node ${process.version}`,
);
if (args.json !== undefined) writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
if (args.markdown !== undefined) writeFileSync(args.markdown, `${markdown}\n`);
