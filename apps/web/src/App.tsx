import { loadWasmEngine } from '@cube/solver-wasm';
import wasmUrl from '@cube/solver-wasm/solver.wasm?url';
import { useEffect, useState } from 'react';

type EngineStatus =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly version: string }
  | { readonly state: 'failed'; readonly message: string };

export function App() {
  const [engine, setEngine] = useState<EngineStatus>({ state: 'loading' });

  useEffect(() => {
    loadWasmEngine(wasmUrl).then(
      ({ version }) => {
        setEngine({ state: 'ready', version });
      },
      (error: unknown) => {
        setEngine({ state: 'failed', message: String(error) });
      },
    );
  }, []);

  return (
    <main>
      <h1>Cube Solver</h1>
      <dl>
        <dt>WASM engine</dt>
        <dd>
          {engine.state === 'loading' && 'loading'}
          {engine.state === 'ready' && engine.version}
          {engine.state === 'failed' && `failed: ${engine.message}`}
        </dd>
        <dt>Cross-origin isolated</dt>
        <dd>{String(crossOriginIsolated)}</dd>
      </dl>
    </main>
  );
}
