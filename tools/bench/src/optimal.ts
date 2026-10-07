import {
  applyFaceTurns,
  FACE_TURNS,
  faceTurnIndex,
  formatFaceTurns,
  isSolved,
  parseFacelets,
  randomCube,
  Xoshiro128StarStar,
  type CubieCube,
} from '@cube/core';
import {
  buildOptimalTables,
  buildTwoPhaseTables,
  createOptimalSolver,
  createParallelOptimalSolver,
  createTwoPhaseSolver,
  type DepthStats,
  type OptimalSolve,
  type OptimalTier,
} from '@cube/solver-ts';
import { Engine, initWasm } from '@cube/solver-wasm';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { nodeHelperPool } from './node-pool.ts';
import { KOCIEMBA_POSITIONS } from './positions.ts';

// Optimal solver benchmark: Kociemba's published positions (default) or seeded random states.
// `--through-depth D` stops each search after depth D, which is enough to compare node counts
// per depth without waiting for full solves.

const { values: args } = parseArgs({
  options: {
    tier: { type: 'string', default: 'standard' },
    table: { type: 'string' },
    positions: { type: 'string', default: 'kociemba' },
    only: { type: 'string' },
    count: { type: 'string', default: '5' },
    seed: { type: 'string', default: '1' },
    'through-depth': { type: 'string' },
    'upper-bound': { type: 'boolean', default: true },
    threads: { type: 'string', default: '1' },
    engine: { type: 'string', default: 'ts' },
    label: { type: 'string' },
    json: { type: 'string' },
    markdown: { type: 'string' },
  },
  allowNegative: true,
});

const tier: OptimalTier = args.tier === 'huge' ? 'huge' : 'standard';
const tablePath = args.table ?? `../../.cache/optimal-${tier}.bin`;
const throughDepth =
  args['through-depth'] === undefined ? undefined : Number(args['through-depth']);
const threads = Number(args.threads);
const wasm = args.engine === 'wasm';
const label = args.label ?? `optimal-${wasm ? 'wasm' : 'ts'}-${tier}-${String(threads)}t`;
if (wasm && threads > 1) throw new Error('The WebAssembly engine searches on one thread');

interface Case {
  readonly name: string;
  readonly cube: CubieCube;
  readonly optimal?: number;
  readonly published?: Readonly<Record<number, number>>;
}

function cases(): Case[] {
  if (args.positions === 'random') {
    const rng = Xoshiro128StarStar.fromSeed(Number(args.seed));
    return Array.from({ length: Number(args.count) }, (_, i) => ({
      name: `seed ${args.seed} #${String(i + 1)}`,
      cube: randomCube(rng),
    }));
  }
  const only = args.only?.split(',').map((s) => s.trim());
  return KOCIEMBA_POSITIONS.filter((p) => only === undefined || only.includes(p.name)).map((p) => {
    const parsed = parseFacelets(p.facelets);
    if (!parsed.ok) throw new Error(`Bad facelets for ${p.name}`);
    return { name: p.name, cube: parsed.value, optimal: p.optimal, published: p.nodes };
  });
}

const moves = buildTwoPhaseTables();
const fast = createTwoPhaseSolver(moves);

function turnAt(index: number) {
  const turn = FACE_TURNS[index];
  if (turn === undefined) throw new RangeError(`No move ${String(index)}`);
  return turn;
}

/** The Rust engine's optimal search behind the same signature, with depths read off progress. */
async function wasmSolver(): Promise<{
  solve: OptimalSolve;
  prepareMs: number;
  restored: boolean;
}> {
  const wasmFile = new URL(import.meta.resolve('@cube/solver-wasm/solver.wasm'));
  const memory = await initWasm(readFileSync(wasmFile));
  const engine = new Engine();
  engine.init({ onProgress: () => true });
  const start = performance.now();
  let useSaved = false;
  if (existsSync(tablePath)) {
    // Straight into WebAssembly memory, in chunks: no second copy of up to 833 MB.
    const size = statSync(tablePath).size;
    const address = engine.allocateTableFile(size);
    const view = new Uint8Array(memory.buffer, address, size);
    const fd = openSync(tablePath, 'r');
    for (let at = 0; at < size;) at += readSync(fd, view, at, Math.min(1 << 26, size - at), at);
    closeSync(fd);
    useSaved = true;
  }
  if (engine.prepareOptimal(tier === 'huge', useSaved, { onProgress: () => true }) < 0) {
    throw new Error('Table build stopped');
  }
  const prepareMs = performance.now() - start;
  const solve: OptimalSolve = (cube, options = {}) => {
    const begin = performance.now();
    const depths: DepthStats[] = [];
    let current = -1;
    let depthStart = begin;
    let depthNodes = 0;
    let stop = false;
    const outcome = engine.solveOptimal(
      Uint8Array.from([...cube.cp, ...cube.co, ...cube.ep, ...cube.eo]),
      Uint8Array.from(options.upperBound?.map(faceTurnIndex) ?? []),
      {
        now: () => performance.now(),
        shouldStop: () => stop,
        onProgress: (depth, _best, nodes) => {
          if (depth !== current) {
            if (current >= 0) {
              depths.push({
                depth: current,
                nodes: nodes - depthNodes,
                ms: performance.now() - depthStart,
              });
            }
            current = depth;
            depthStart = performance.now();
            depthNodes = nodes;
          }
          options.onProgress?.({ depth, nodes, elapsedMs: performance.now() - begin });
          stop = options.shouldStop?.() === true;
        },
        onImprovement: () => undefined,
      },
    );
    const found = outcome.moves;
    if (found !== undefined && outcome.stoppedBy === 'proven' && current >= 0) {
      depths.push({
        depth: current,
        nodes: outcome.nodes - depthNodes,
        ms: performance.now() - depthStart,
      });
    }
    const result = {
      moves: found === undefined ? undefined : Array.from(found, turnAt),
      cancelled: outcome.stoppedBy === 'cancelled',
      provedBound: found !== undefined && found.length === options.upperBound?.length,
      nodes: outcome.nodes,
      elapsedMs: performance.now() - begin,
      depths,
    };
    outcome.free();
    return result;
  };
  return { solve, prepareMs, restored: useSaved && engine.restored };
}

let solve: OptimalSolve;
let prepareMs: number;
let tableBytes: number;
let parallel: (OptimalSolve & { readonly dispose: () => void }) | undefined;
let pool: ReturnType<typeof nodeHelperPool> | undefined;
let restored: boolean;
if (wasm) {
  ({ solve, prepareMs, restored } = await wasmSolver());
  tableBytes = statSync(tablePath).size;
} else {
  const saved = existsSync(tablePath) ? new Uint8Array(readFileSync(tablePath)) : null;
  const prepareStart = performance.now();
  const tables = buildOptimalTables(tier, moves, saved, {}, threads > 1);
  if (tables === null) throw new Error('Table build stopped');
  prepareMs = performance.now() - prepareStart;
  restored = tables.restored;
  tableBytes = tables.file.byteLength;
  if (!tables.restored) {
    mkdirSync(dirname(tablePath), { recursive: true });
    writeFileSync(tablePath, tables.file);
  }
  pool = threads > 1 ? nodeHelperPool(threads - 1) : undefined;
  parallel = pool === undefined ? undefined : createParallelOptimalSolver(tables, pool);
  solve = parallel ?? createOptimalSolver(tables);
}
console.log(`${tier} table ${restored ? 'loaded' : 'built'} in ${(prepareMs / 1000).toFixed(1)} s`);

interface Row {
  readonly name: string;
  readonly length: number | null;
  readonly optimal: number | null;
  readonly proven: boolean;
  readonly upperBound: number | null;
  readonly ms: number;
  readonly nodes: number;
  readonly depths: readonly DepthStats[];
  readonly published: Readonly<Record<number, number>> | null;
  readonly matchesPublished: boolean | null;
}

const rows: Row[] = [];
for (const { name, cube, optimal, published } of cases()) {
  const bound = args['upper-bound']
    ? fast(cube, { maxLength: 0, timeLimitMs: 1000 }).moves
    : undefined;
  let depth = 0;
  const result = solve(cube, {
    ...(bound === undefined ? {} : { upperBound: bound }),
    onProgress: (progress) => {
      depth = progress.depth;
    },
    shouldStop: () => throughDepth !== undefined && depth > throughDepth,
  });
  const solution = result.moves;
  if (solution !== undefined && !isSolved(applyFaceTurns(cube, solution))) {
    throw new Error(`${name}: the solution does not solve the cube`);
  }
  const compared = result.depths.filter((d) => published?.[d.depth] !== undefined);
  const matches =
    compared.length === 0 ? null : compared.every((d) => published?.[d.depth] === d.nodes);
  const row: Row = {
    name,
    length: solution?.length ?? null,
    optimal: optimal ?? null,
    proven: !result.cancelled,
    upperBound: bound?.length ?? null,
    ms: Math.round(result.elapsedMs),
    nodes: result.nodes,
    depths: result.depths,
    published: published ?? null,
    matchesPublished: matches,
  };
  rows.push(row);
  console.log(
    `${name}: ${solution === undefined ? '-' : formatFaceTurns(solution)} ` +
      `(${String(row.length ?? '-')}${row.proven ? '*' : ''}) in ${(row.ms / 1000).toFixed(1)} s, ` +
      `${(row.nodes / 1e6).toFixed(1)} M nodes` +
      (matches === null ? '' : `, per-depth nodes ${matches ? 'match' : 'DIFFER from'} published`),
  );
  for (const d of result.depths) {
    const reference = published?.[d.depth];
    console.log(
      `  depth ${String(d.depth)}: ${String(d.nodes)} nodes in ${(d.ms / 1000).toFixed(2)} s` +
        (reference === undefined ? '' : ` (published ${String(reference)})`),
    );
  }
  if (optimal !== undefined && row.proven && row.length !== optimal) {
    throw new Error(`${name}: found ${String(row.length)}, published optimum ${String(optimal)}`);
  }
}

const totalMs = rows.reduce((s, r) => s + r.ms, 0);
const totalNodes = rows.reduce((s, r) => s + r.nodes, 0);
const report = {
  label,
  date: new Date().toISOString(),
  machine: {
    cpu: cpus()[0]?.model ?? 'unknown',
    platform: `${platform()} ${release()}`,
    node: process.version,
  },
  settings: {
    engine: wasm ? 'wasm' : 'ts',
    tier,
    threads,
    positions: args.positions,
    throughDepth,
    upperBound: args['upper-bound'],
  },
  prepareMs: Math.round(prepareMs),
  tableBytes,
  totals: {
    ms: totalMs,
    nodes: totalNodes,
    nodesPerSecond: Math.round(totalNodes / (totalMs / 1000)),
  },
  rows,
};
console.log(
  `total ${(totalMs / 1000).toFixed(1)} s, ${(totalNodes / 1e9).toFixed(2)} G nodes, ` +
    `${(report.totals.nodesPerSecond / 1e6).toFixed(1)} M nodes/s`,
);

if (args.json !== undefined) writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
if (args.markdown !== undefined) {
  const lines = [
    `| Position | Length | Time | Nodes | Nodes/s |`,
    `| --- | --- | --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.name} | ${String(r.length ?? '–')}${r.proven ? '*' : ''} | ${(r.ms / 1000).toFixed(1)} s | ` +
        `${(r.nodes / 1e6).toFixed(0)} M | ${(r.nodes / r.ms / 1000).toFixed(1)} M |`,
    ),
  ];
  writeFileSync(args.markdown, `${lines.join('\n')}\n`);
}
parallel?.dispose();
pool?.terminate();
