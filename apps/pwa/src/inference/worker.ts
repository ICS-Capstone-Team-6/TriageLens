/// <reference lib="webworker" />
// Runs off the main thread (pwa-offline rule): decode, quality check, cxr-pre-2 and the model.
// The model bytes are checked against a SHA-256 before use (signing comes with ADR-11).
// Keep the WASM loader separate: bundling its pthread bootstrap into this worker hangs production builds.
import * as ort from 'onnxruntime-web/wasm';
import { INPUT_SIZE, PREPROCESS_VERSION, preprocess, rgbaToGray } from '../lib/preprocess';
import { checkQuality, colourfulness } from '../lib/quality';
import { inputStats } from '../lib/stats';
import { loadModelBytes } from '../lib/modelCache';
import { MODEL_CACHE } from '../sw/routes';
import type { Screened, WorkerRequest, WorkerResponse } from './messages';

declare const self: DedicatedWorkerGlobalScope;

let session: ort.InferenceSession | null = null;
let threads = 1;

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); // hex digest, not a label: taste-skill-ignore
}

async function init(modelUrl: string, modelSha256: string) {
  try {
    ort.env.wasm.wasmPaths = new URL('/ort/', self.location.href).href;
    threads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    ort.env.wasm.numThreads = threads;
    // Offline (E8-02): verified model bytes live in the Cache API; see lib/modelCache.ts.
    let cache: Cache | null = null;
    try {
      cache = 'caches' in self ? await caches.open(MODEL_CACHE) : null;
    } catch {
      cache = null;
    }
    const m = await loadModelBytes(modelUrl, modelSha256, sha256Hex, (u) => fetch(u), cache);
    if (!m.ok) return post({ type: 'error', code: m.code });
    session = await ort.InferenceSession.create(new Uint8Array(m.bytes), { executionProviders: ['wasm'] });
    post({ type: 'ready', threads, modelSha256: m.hash, crossOriginIsolated: self.crossOriginIsolated });
  } catch (e) {
    post({ type: 'error', code: 'model_load', detail: String((e as { message?: string })?.message ?? e).slice(0, 140) });
  }
}

async function screen(file: Blob) {
  const t0 = performance.now();
  let bitmap: ImageBitmap;
  try {
    // Upright as the camera saw it; X-rays in training are upright too.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return post({ type: 'error', code: 'decode' });
  }
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return post({ type: 'error', code: 'decode' });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const t1 = performance.now();

  const quality = checkQuality(rgbaToGray(rgba), width, height, colourfulness(rgba));
  const t1b = performance.now();
  if (quality.passed) post({ type: 'progress', step: 1 });
  if (!quality.passed) {
    return post({ type: 'screened', quality, stats: null, logit: null, preprocess: PREPROCESS_VERSION, timings: { decode_ms: t1 - t0, quality_ms: t1b - t1, preprocess_ms: 0, model_ms: 0 }, threads });
  }
  const { small, tensor } = preprocess(rgba, width, height);
  const stats = inputStats(small, INPUT_SIZE, width, height);
  const t2 = performance.now();
  post({ type: 'progress', step: 2 });

  if (!session) return post({ type: 'error', code: 'model_not_ready' });
  try {
    const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]) };
    // The feature map is only fetched when the model has it; the TB logit never depends on it.
    const wantFeatures = session.outputNames.includes('features');
    const out = await session.run(feeds, wantFeatures ? ['tb_logit', 'features'] : ['tb_logit']);
    const logit = Number((out.tb_logit.data as Float32Array)[0]);
    const t3 = performance.now();
    let features: Screened['features'];
    const f = wantFeatures ? out.features : undefined;
    if (f && f.dims.length === 4 && f.dims[0] === 1) {
      const data = Float32Array.from(f.data as Float32Array);
      features = { data, dims: [Number(f.dims[1]), Number(f.dims[2]), Number(f.dims[3])] };
    }
    post({ type: 'screened', quality, stats, logit, preprocess: PREPROCESS_VERSION, timings: { decode_ms: t1 - t0, quality_ms: t1b - t1, preprocess_ms: t2 - t1b, model_ms: t3 - t2 }, threads, features },
      features ? [features.data.buffer] : []);
  } catch {
    return post({ type: 'error', code: 'model_run' });
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.type === 'init') void init(m.modelUrl, m.modelSha256);
  else if (m.type === 'screen') void screen(m.file);
};
