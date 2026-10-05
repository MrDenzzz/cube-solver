import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CRATE = 'bindings';
const OUT_NAME = 'solver';
const TARGET = 'wasm32-unknown-unknown';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const outDir = fileURLToPath(new URL('../pkg/', import.meta.url));
const wasmOpt = fileURLToPath(new URL('../node_modules/binaryen/bin/wasm-opt', import.meta.url));
const rawWasm = `${repoRoot}target/${TARGET}/release/${CRATE}.wasm`;
const finalWasm = `${outDir}${OUT_NAME}_bg.wasm`;

function run(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

// wasm-bindgen embeds a schema version into the module, so a CLI that differs from the
// crate version fails late with an unhelpful message. Fail early with a clear one instead.
function assertBindgenVersionsMatch(): void {
  const lock = readFileSync(`${repoRoot}Cargo.lock`, 'utf8');
  const locked = /name = "wasm-bindgen"\r?\nversion = "([^"]+)"/.exec(lock)?.[1];
  const cli = /wasm-bindgen (\S+)/.exec(run('wasm-bindgen', ['--version']))?.[1];
  if (locked === undefined || cli === undefined || locked !== cli) {
    throw new Error(
      `wasm-bindgen CLI ${cli ?? 'not found'} does not match crate ${locked ?? 'not locked'}. ` +
        `Install it with: cargo install wasm-bindgen-cli --version ${locked ?? '<version>'} --locked`,
    );
  }
}

assertBindgenVersionsMatch();
run('cargo', ['build', '--release', '--locked', '--target', TARGET, '-p', CRATE]);
rmSync(outDir, { recursive: true, force: true });
run('wasm-bindgen', ['--target', 'web', '--out-dir', outDir, '--out-name', OUT_NAME, rawWasm]);
run(process.execPath, [wasmOpt, '-O3', finalWasm, '-o', finalWasm]);
