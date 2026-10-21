/// <reference lib="webworker" />
// Runs off the main thread (pwa-offline rule): decode, quality check, cxr-pre-2 and the model.
// The model bytes are checked against a SHA-256 before use (signing comes with ADR-11).
import * as ort from 'onnxruntime-web';
import { INPUT_SIZE, PREPROCESS_VERSION, preprocess, rgbaToGray } from '../lib/preprocess';
import { checkQuality, colourfulness } from '../lib/quality';
import { inputStats } from '../lib/stats';
import type { WorkerRequest, WorkerResponse } from './messages';

declare const self: DedicatedWorkerGlobalScope;

let session: ort.InferenceSession | null = null;
let threads = 1;

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); // hex digest, not a label: taste-skill-ignore
}

async function init(modelUrl: string, modelSha256: string) {
  try {
    ort.env.wasm.wasmPaths = '/ort/';
    threads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    ort.env.wasm.numThreads = threads;
    const r = await fetch(modelUrl);
    if (!r.ok) return post({ type: 'error', code: 'model_unreachable' });
    const bytes = await r.arrayBuffer();
    const hash = await sha256Hex(bytes);
    if (modelSha256 && hash !== modelSha256.toLowerCase()) return post({ type: 'error', code: 'model_checksum' });
    session = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'] });
    post({ type: 'ready', threads, modelSha256: hash, crossOriginIsolated: self.crossOriginIsolated });
  } catch {
    post({ type: 'error', code: 'model_load' });
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
  if (quality.passed) post({ type: 'progress', step: 1 });
  if (!quality.passed) {
    return post({ type: 'screened', quality, stats: null, logit: null, preprocess: PREPROCESS_VERSION, timings: { decode_ms: t1 - t0, preprocess_ms: 0, model_ms: 0 }, threads });
  }
  const { small, tensor } = preprocess(rgba, width, height);
  const stats = inputStats(small, INPUT_SIZE, width, height);
  const t2 = performance.now();
  post({ type: 'progress', step: 2 });

  if (!session) return post({ type: 'error', code: 'model_not_ready' });
  try {
    const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]) };
    const out = await session.run(feeds, ['tb_logit']);
    const logit = Number((out.tb_logit.data as Float32Array)[0]);
    const t3 = performance.now();
    post({ type: 'screened', quality, stats, logit, preprocess: PREPROCESS_VERSION, timings: { decode_ms: t1 - t0, preprocess_ms: t2 - t1, model_ms: t3 - t2 }, threads });
  } catch {
    post({ type: 'error', code: 'model_run' });
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.type === 'init') void init(m.modelUrl, m.modelSha256);
  else if (m.type === 'screen') void screen(m.file);
};
