/// <reference types="vitest" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Service worker build (E8-02): src/sw/sw.ts becomes /sw.js (no hash, so the browser finds
// updates). The list of files to pre-cache and a build ID are written into it here, so each
// build gets a fresh shell cache and old ones are deleted on activate.
function publicFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? publicFiles(p) : [p];
  });
}

function serviceWorker(): Plugin {
  return {
    name: 'triagelens-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const sw = Object.values(bundle).find((c) => c.type === 'chunk' && c.name === 'sw');
      if (!sw || sw.type !== 'chunk') return this.error('service worker entry missing');
      const pub = resolve(import.meta.dirname, 'public');
      const id = createHash('sha256');
      // Skipped: source maps; .woff (every target browser takes .woff2); the bundler's hashed
      // copy of the ONNX Runtime wasm, because the worker loads /ort/ (wasmPaths) and
      // pre-caching both would spend about 15 MB of the 45 MB install budget (TRD 8).
      const skip = (f: string) => f.endsWith('.map') || f.endsWith('.woff') || /^assets\/ort-wasm.*\.wasm$/.test(f);
      const own = Object.keys(bundle).filter((f) => f !== sw.fileName && !skip(f)).sort();
      // index.html is emitted after this hook runs, so it is added by name.
      if (!own.includes('index.html')) own.unshift('index.html');
      for (const f of own) id.update(f);
      const extra = publicFiles(pub).map((p) => {
        id.update(readFileSync(p));
        return relative(pub, p).split('\\').join('/');
      });
      const precache = [...own, ...extra.sort()].map((f) => `/${f}`);
      sw.code = sw.code
        .replace(/__PRECACHE__/g, JSON.stringify(precache))
        .replace(/__BUILD_ID__/g, JSON.stringify(id.digest('hex').slice(0, 12)));
    },
  };
}

// COOP + COEP make the page cross-origin isolated so ONNX Runtime can use threads
// (pwa-offline rule); the app falls back to one thread when isolation is missing.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // TRD NFR-COMP-01: preserve the supported browsers as Vite's defaults advance.
  build: {
    target: ['chrome90', 'safari16'],
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, 'index.html'), sw: resolve(import.meta.dirname, 'src/sw/sw.ts') },
      output: { entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
