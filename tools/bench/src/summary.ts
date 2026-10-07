import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

// Writes the summaries the web app's benchmark page shows, without the per-cube samples that
// make the result files large. Run after recording results; the output is committed.

const { values: args } = parseArgs({
  options: {
    results: { type: 'string', default: 'results' },
    out: { type: 'string', default: '../../apps/web/src/bench/recorded.json' },
  },
});

const dir = args.results;
const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const files = readdirSync(dir).filter((name) => name.endsWith('.json'));

interface Machine {
  readonly cpu?: string;
  readonly node?: string;
}

interface TwoPhaseFile {
  readonly machine: Machine;
  readonly settings: { readonly count: number; readonly maxLength: number };
  readonly summary: {
    readonly meanLength: number;
    readonly reachedTarget: number;
    readonly medianMs: number;
    readonly p95Ms: number;
    readonly maxMs: number;
    readonly nodesPerSecond: number;
  };
}

interface OptimalFile {
  readonly settings: { readonly engine: string; readonly tier: string; readonly threads: number };
  readonly totals: { readonly ms: number; readonly nodes: number; readonly nodesPerSecond: number };
}

interface ReductionFile {
  readonly settings: {
    readonly count: number;
    readonly phase2Candidates: number;
    readonly phase3Candidates: number;
    readonly finishTimeMs: number;
  };
  readonly summary: {
    readonly meanLength: number;
    readonly meanPhaseLengths: readonly number[];
    readonly medianMs: number;
    readonly p95Ms: number;
    readonly maxMs: number;
  };
}

const twoPhase = files
  .filter((name) => /^two-phase-ts-\d+\.json$/.test(name))
  .map((name) => read(name) as TwoPhaseFile);

// The engine comparison of ADR 0007: one file per engine, tier, thread count and repeat.
const optimal = files
  .filter((name) => /^optimal-(ts|wasm)-(standard|huge)-\d+t(-r\d)?\.json$/.test(name))
  .map((name) => {
    const { settings, totals } = read(name) as OptimalFile;
    return {
      engine: settings.engine,
      tier: settings.tier,
      threads: settings.threads,
      ms: totals.ms,
      nodes: totals.nodes,
      nodesPerSecond: totals.nodesPerSecond,
    };
  });

const reduction = files
  .filter((name) => /^reduction-ts-.*\.json$/.test(name))
  .map((name) => read(name) as ReductionFile);

const machine = twoPhase[0]?.machine ?? {};
const summary = {
  machine: { cpu: machine.cpu?.trim(), node: machine.node },
  twoPhase: twoPhase
    .map(({ settings, summary: s }) => ({
      count: settings.count,
      maxLength: settings.maxLength,
      meanLength: s.meanLength,
      reachedTarget: s.reachedTarget,
      medianMs: s.medianMs,
      p95Ms: s.p95Ms,
      maxMs: s.maxMs,
      nodesPerSecond: s.nodesPerSecond,
    }))
    .sort((a, b) => a.maxLength - b.maxLength),
  optimal: optimal.sort(
    (a, b) =>
      a.tier.localeCompare(b.tier) || a.threads - b.threads || a.engine.localeCompare(b.engine),
  ),
  reduction: reduction
    .map(({ settings, summary: s }) => ({
      count: settings.count,
      phase2Candidates: settings.phase2Candidates,
      phase3Candidates: settings.phase3Candidates,
      finishTimeMs: settings.finishTimeMs,
      meanLength: s.meanLength,
      meanPhaseLengths: s.meanPhaseLengths,
      medianMs: s.medianMs,
      p95Ms: s.p95Ms,
      maxMs: s.maxMs,
    }))
    .sort((a, b) => a.medianMs - b.medianMs),
};

writeFileSync(args.out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Wrote ${args.out}`);
