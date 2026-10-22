// cxr-pre-2: the app's copy of ml/train/preprocess.py (preprocess_spec.json, ADR-16).
// Training and serving must see the same pixels, so this ports Pillow's own maths:
//   1. RGB -> 8-bit grayscale with Pillow's fixed-point ITU-R 601-2 luma ('L' mode);
//   2. a straight resize to 320 x 320 with Pillow's BILINEAR resampling, which widens
//      the filter when shrinking (a browser canvas resize does not do this);
//   3. copy to 3 channels, divide by 255, subtract mean and divide by std (NCHW float32).
// src/lib/preprocess.test.ts checks steps 1 and 2 byte for byte against Pillow output.

export const PREPROCESS_VERSION = 'cxr-pre-2';
export const INPUT_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const PRECISION_BITS = 32 - 8 - 2; // Pillow Resample.c, 8 bits per channel

/** Pillow ImagingConvert RGB -> L: (R*19595 + G*38470 + B*7471 + 0x8000) >> 16. Alpha is ignored. */
export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, channels = 4): Uint8Array {
  const n = rgba.length / channels;
  const out = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    out[i] = (rgba[p] * 19595 + rgba[p + 1] * 38470 + rgba[p + 2] * 7471 + 0x8000) >>> 16;
  }
  return out;
}

interface Coeffs { bounds: Int32Array; kk: Int32Array; ksize: number }

// Pillow precompute_coeffs + normalize_coeffs_8bpc for the bilinear (triangle) filter, support 1.
function precompute(inSize: number, outSize: number): Coeffs {
  const scale = inSize / outSize;
  const filterscale = Math.max(scale, 1);
  const support = 1.0 * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const kk = new Int32Array(outSize * ksize);
  const ss = 1 / filterscale;
  const pre = new Float64Array(ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    let xmin = Math.trunc(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      const t = Math.abs((x + xmin - center + 0.5) * ss);
      const w = t < 1 ? 1 - t : 0;
      pre[x] = w;
      ww += w;
    }
    for (let x = 0; x < ksize; x++) {
      const k = x < xmax && ww !== 0 ? pre[x] / ww : 0;
      kk[xx * ksize + x] = k < 0 ? Math.trunc(-0.5 + k * (1 << PRECISION_BITS)) : Math.trunc(0.5 + k * (1 << PRECISION_BITS));
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { bounds, kk, ksize };
}

function clip8(v: number): number {
  if (v >= 2 ** (PRECISION_BITS + 8)) return 255;
  if (v <= 0) return 0;
  return Math.floor(v / (1 << PRECISION_BITS));
}

/** Pillow Image.resize((outW, outH), BILINEAR) for one 8-bit channel: horizontal pass, then vertical. */
export function resizeBilinear(src: Uint8Array, w: number, h: number, outW: number, outH: number): Uint8Array {
  let cur = src;
  let curW = w;
  if (outW !== w) {
    const { bounds, kk, ksize } = precompute(w, outW);
    const tmp = new Uint8Array(outW * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let xx = 0; xx < outW; xx++) {
        const xmin = bounds[xx * 2], xmax = bounds[xx * 2 + 1];
        let ss = 1 << (PRECISION_BITS - 1);
        for (let x = 0; x < xmax; x++) ss += src[row + x + xmin] * kk[xx * ksize + x];
        tmp[y * outW + xx] = clip8(ss);
      }
    }
    cur = tmp;
    curW = outW;
  }
  if (outH === h) return cur;
  const { bounds, kk, ksize } = precompute(h, outH);
  const out = new Uint8Array(curW * outH);
  for (let yy = 0; yy < outH; yy++) {
    const ymin = bounds[yy * 2], ymax = bounds[yy * 2 + 1];
    for (let x = 0; x < curW; x++) {
      let ss = 1 << (PRECISION_BITS - 1);
      for (let y = 0; y < ymax; y++) ss += cur[(y + ymin) * curW + x] * kk[yy * ksize + y];
      out[yy * curW + x] = clip8(ss);
    }
  }
  return out;
}

/** 320 x 320 grayscale -> float32 [1, 3, 320, 320], normalized per channel. */
export function normalize(gray: Uint8Array): Float32Array {
  const n = gray.length;
  const out = new Float32Array(3 * n);
  for (let c = 0; c < 3; c++) {
    const m = MEAN[c], s = STD[c];
    for (let i = 0; i < n; i++) out[c * n + i] = (gray[i] / 255 - m) / s;
  }
  return out;
}

/** Full cxr-pre-2 path from decoded RGBA pixels. Returns the model-size grayscale too (for input statistics). */
export function preprocess(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const gray = rgbaToGray(rgba);
  const small = resizeBilinear(gray, width, height, INPUT_SIZE, INPUT_SIZE);
  return { gray, small, tensor: normalize(small) };
}
