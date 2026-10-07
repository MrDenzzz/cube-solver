import { buildOptimalTables, buildTwoPhaseTables, type OptimalTier } from '@cube/solver-ts';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

// Builds the optimal solver's prune table in the same file format the browser caches, so that
// benchmarks and tests can reuse it, and reports how long each part takes.

const { values: args } = parseArgs({
  options: {
    tier: { type: 'string', default: 'standard' },
    out: { type: 'string' },
    check: { type: 'string' },
  },
});

const tier: OptimalTier = args.tier === 'huge' ? 'huge' : 'standard';
const out = args.out ?? `.cache/optimal-${tier}.bin`;
const mib = (bytes: number) => (bytes / 2 ** 20).toFixed(1);

const moveStart = performance.now();
const moves = buildTwoPhaseTables();
console.log(`move tables: ${(performance.now() - moveStart).toFixed(0)} ms`);

if (args.check !== undefined) {
  // Restoring a file validates its header and checksum and skips the search.
  const start = performance.now();
  const saved = new Uint8Array(readFileSync(args.check));
  const tables = buildOptimalTables(tier, moves, saved);
  const reused = tables?.restored === true;
  console.log(
    `${args.check}: ${reused ? 'valid' : 'rejected'} in ${(performance.now() - start).toFixed(0)} ms`,
  );
  process.exit(reused ? 0 : 1);
}

let lastPercent = -1;
const start = performance.now();
const tables = buildOptimalTables(tier, moves, null, {
  onProgress(done, total) {
    const percent = Math.floor((done / total) * 100);
    if (percent >= lastPercent + 10) {
      lastPercent = percent;
      console.log(
        `${String(percent).padStart(3)}%  ${((performance.now() - start) / 1000).toFixed(1)} s`,
      );
    }
  },
});
if (tables === null) throw new Error('Stopped');
const seconds = (performance.now() - start) / 1000;
console.log(
  `${tier}: ${String(tables.classes.count)} classes, ${mib(tables.file.byteLength)} MiB in ${seconds.toFixed(1)} s`,
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, tables.file);
console.log(`written to ${out}`);
