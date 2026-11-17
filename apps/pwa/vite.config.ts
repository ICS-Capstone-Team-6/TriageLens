/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// COOP + COEP make the page cross-origin isolated so ONNX Runtime can use threads
// (pwa-offline rule); the app falls back to one thread when isolation is missing.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  // TRD NFR-COMP-01: preserve the supported browsers as Vite's defaults advance.
  build: { target: ['chrome90', 'safari16'] },
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
