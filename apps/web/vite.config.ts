import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// SharedArrayBuffer (search cancellation flag) and measureUserAgentSpecificMemory need
// cross-origin isolation. Production serves the same headers from nginx.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
  // The solver worker is a module worker; ES output lets it share chunks with the page.
  worker: { format: 'es' },
  build: {
    // The largest chunk is three.js with React Three Fiber, loaded lazily after the page renders.
    chunkSizeWarningLimit: 1000,
  },
});
