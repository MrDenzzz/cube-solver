import { lazy, Suspense, useSyncExternalStore } from 'react';
import { App } from './App.tsx';
import { PAGE_HASH } from './ui/pages.ts';

const BenchPage = lazy(() =>
  import('./bench/BenchPage.tsx').then((m) => ({ default: m.BenchPage })),
);

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
  };
}

/** Two pages chosen by the URL hash; the solver worker outlives both. */
export function Root() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return hash === PAGE_HASH.bench ? (
    <Suspense fallback={null}>
      <BenchPage />
    </Suspense>
  ) : (
    <App />
  );
}
