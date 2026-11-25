// Class activation map (ADR-9; E6-02, E10-07). cam[h, w] = sum_c weight[c] * features[c, h, w],
// the same as models.TBNet.cam in ml/train. Only areas that raised the TB score are drawn
// (negative values are left clear). Shown to the receiving clinician with the image, never
// as a finding on its own; the health worker is not trained to read it (ADR-22).
// Pure parts are tested in heatmap.test.ts; drawing needs a browser canvas.

export interface CamHead {
  version: string;
  runId: string;
  modelSha256: string;
  channels: number;
  weight: Float32Array;
  bias: number;
}

/** null unless the file is complete and belongs to this exact model (hazard H7). */
export function parseCamHead(file: unknown, expectedRunId: string, modelSha256: string): CamHead | null {
  const f = file as Record<string, unknown> | null;
  if (!f || f.version !== 'cam-head-1' || f.run_id !== expectedRunId) return null;
  if (typeof f.model_sha256 !== 'string' || f.model_sha256.toLowerCase() !== modelSha256.toLowerCase()) return null;
  const n = Number(f.channels);
  if (!Number.isInteger(n) || n <= 0 || !Array.isArray(f.weight) || f.weight.length !== n) return null;
  if (!f.weight.every((x) => typeof x === 'number' && Number.isFinite(x)) || typeof f.bias !== 'number') return null;
  return { version: f.version, runId: f.run_id, modelSha256: f.model_sha256.toLowerCase(), channels: n, weight: Float32Array.from(f.weight as number[]), bias: f.bias };
}

/** features laid out [C, h, w]. Returns h*w values, or null if the shapes do not match. */
export function computeCam(features: Float32Array, dims: [number, number, number], head: CamHead): Float32Array | null {
  const [c, h, w] = dims;
  if (c !== head.channels || features.length !== c * h * w || h <= 0 || w <= 0) return null;
  const out = new Float32Array(h * w);
  const plane = h * w;
  for (let k = 0; k < c; k++) {
    const wk = head.weight[k];
    const base = k * plane;
    for (let i = 0; i < plane; i++) out[i] += wk * features[base + i];
  }
  return out;
}

/** Keeps only positive evidence and scales to 0..1. null when nothing raised the score. */
export function normalizeCam(cam: Float32Array): Float32Array | null {
  let max = 0;
  for (const v of cam) if (Number.isFinite(v) && v > max) max = v;
  if (!(max > 0)) return null;
  return cam.map((v) => (Number.isFinite(v) && v > 0 ? v / max : 0));
}

/** Transparent below 0.2, then yellow to red with rising opacity. RGBA 0..255. */
export function heatColour(v: number): [number, number, number, number] {
  if (!(v >= 0.2)) return [0, 0, 0, 0];
  const t = Math.min(1, (v - 0.2) / 0.8);
  return [255, Math.round(220 * (1 - t)), 0, Math.round(80 + 110 * t)];
}

/** Draws the map over the image and returns a JPEG. Browser only. */
export async function renderHeatmap(image: Blob, cam01: Float32Array, h: number, w: number): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // The model saw the image stretched to a square (cxr-pre-2, ADR-16), so the map stretches back.
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d');
  if (!sctx) return null;
  const px = sctx.createImageData(w, h);
  for (let i = 0; i < h * w; i++) px.data.set(heatColour(cam01[i]), i * 4);
  sctx.putImageData(px, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
}

export async function loadCamHead(expectedRunId: string, modelSha256: string): Promise<CamHead | null> {
  try {
    const r = await fetch('/config/cam_head.json', { cache: 'no-store' });
    return r.ok ? parseCamHead(await r.json(), expectedRunId, modelSha256) : null;
  } catch {
    return null;
  }
}
