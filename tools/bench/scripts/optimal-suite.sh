#!/usr/bin/env bash
# The measurements behind docs/adr/0007: both engines on Kociemba's ten random positions, searched
# through depth 16 (so node counts are identical everywhere), engines interleaved to spread drift
# in clock speed over all of them. Needs the tables in ../../.cache (pnpm --filter @cube/tablegen gen).
set -euo pipefail
cd "$(dirname "$0")/.."

POSITIONS="random 1,random 2,random 3,random 4,random 5,random 6,random 7,random 8,random 9,random 10"
COMMON=(--through-depth 16 --no-upper-bound --only "$POSITIONS")

run() {
  local name=$1
  shift
  echo "== $name"
  node --max-old-space-size=4096 src/optimal.ts "$@" "${COMMON[@]}" \
    --label "$name" --json "results/$name.json" | grep -E '^total|table'
}

for round in 1 2; do
  run "optimal-ts-standard-1t-r$round" --tier standard
  run "optimal-wasm-standard-1t-r$round" --engine wasm --tier standard
done
run optimal-ts-standard-8t --tier standard --threads 8
run optimal-ts-standard-16t --tier standard --threads 16
for round in 1 2; do
  run "optimal-ts-huge-1t-r$round" --tier huge
  run "optimal-wasm-huge-1t-r$round" --engine wasm --tier huge
done
run optimal-ts-huge-16t --tier huge --threads 16
