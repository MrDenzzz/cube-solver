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
});
