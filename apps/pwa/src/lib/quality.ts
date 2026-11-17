// Quality check v1 for the M2 slice: simple, explainable pixel rules on the full-size
// grayscale image. A failure gives no zone and one plain retake reason (TRD 7.2, FR-03).
// These limits are not yet validated against a labelled set of bad images; the
// learned quality gate (TRD 10.6 'gate' model) replaces them later.
//   - too small: shortest side under 512 px, the same floor the training pipeline
//     uses (ml/pipeline/build_dataset.py MIN_SIDE);
//   - blank: almost no variation in brightness;
//   - too dark: average brightness very low;
//   - not an X-ray: a colourful photo (Hasler and Suesstrunk colourfulness). X-rays are grey,
//     even when photographed on a tinted light box, so a high score means a photo of
//     something else. This does NOT catch grey images that are not chest X-rays: that
//     needs the learned modality gate (hazard H3, ADR-19).

export const QUALITY_VERSION = 'quality-v1';
export const MIN_SIDE = 512;
export const BLANK_STD = 8;
export const DARK_MEAN = 40;
export const COLOURFUL_MAX = 30;

export type RetakeReason = 'too_small' | 'blank' | 'too_dark' | 'not_xray';

export interface QualityResult {
  version: string;
  passed: boolean;
  reason: RetakeReason | null;
  width: number;
  height: number;
  mean: number;
  std: number;
  colourfulness: number;
}

/** Hasler and Suesstrunk (2003) colourfulness on RGBA pixels, sampled 1 in 4. Grey images score near 0. */
export function colourfulness(rgba: Uint8ClampedArray | Uint8Array, channels = 4): number {
  let n = 0, mrg = 0, myb = 0, srg = 0, syb = 0;
  for (let p = 0; p < rgba.length; p += channels * 4) {
    const rg = rgba[p] - rgba[p + 1];
    const yb = 0.5 * (rgba[p] + rgba[p + 1]) - rgba[p + 2];
    n++;
    mrg += rg; myb += yb; srg += rg * rg; syb += yb * yb;
  }
  if (!n) return 0;
  mrg /= n; myb /= n;
  const vrg = Math.max(srg / n - mrg * mrg, 0), vyb = Math.max(syb / n - myb * myb, 0);
  return Math.sqrt(vrg + vyb) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
}

export function checkQuality(gray: Uint8Array, width: number, height: number, colour = 0): QualityResult {
  let sum = 0, sq = 0;
  // A strided sample keeps this fast on large photos; 1 in 4 pixels is plenty for mean and spread.
  const step = 4;
  let n = 0;
  for (let i = 0; i < gray.length; i += step) {
    const v = gray[i];
    sum += v;
    sq += v * v;
    n++;
  }
  const mean = n ? sum / n : 0;
  const std = n ? Math.sqrt(Math.max(sq / n - mean * mean, 0)) : 0;
  let reason: RetakeReason | null = null;
  if (Math.min(width, height) < MIN_SIDE) reason = 'too_small';
  else if (std < BLANK_STD) reason = 'blank';
  else if (mean < DARK_MEAN) reason = 'too_dark';
  else if (colour >= COLOURFUL_MAX) reason = 'not_xray';
  return { version: QUALITY_VERSION, passed: reason === null, reason, width, height, mean, std, colourfulness: Math.round(colour * 10) / 10 };
}
