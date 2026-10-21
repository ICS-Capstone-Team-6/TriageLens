/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// COOP + COEP make the page cross-origin isolated so ONNX Runtime can use threads
// (pwa-offline rule); the app falls back to one thread when isolation is missing.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
