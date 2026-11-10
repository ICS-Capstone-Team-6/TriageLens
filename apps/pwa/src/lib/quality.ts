// Quality check v2 for the M2 slice: fast, explainable pixel rules on the full-size
// grayscale image, plus the colour check on the RGBA copy. A failure gives no zone and one
// plain retake reason (TRD 7.2, FR-03). Checks run in the order below and the first failure
// wins, so every rejection carries exactly one reason (FR-03 acceptance criterion).
//   size -> blank -> exposure (dark, bright) -> colour -> glare -> blur -> framing
// These limits are NOT validated against a labelled set of bad images yet. The learned
// quality gate (TRD 10.6 'gate' model) replaces them, and the limits need calibration on the
// team phone-photo set (E1-05). Hazard H3 owns that gap. A wrong rejection costs a retake,
// which is the safe direction; a wrong pass would let a poor image reach a zone.
//   - too small: shortest side under 512 px, the same floor the training pipeline uses
//     (ml/pipeline/build_dataset.py MIN_SIDE);
//   - blank: almost no variation in brightness;
//   - too dark / too bright: average brightness at either end of the scale;
//   - not an X-ray: a colourful photo (Hasler and Suesstrunk colourfulness). X-rays are grey,
//     even when photographed on a tinted light box, so a high score means a photo of
//     something else. This does NOT catch grey images that are not chest X-rays: that needs
//     the learned modality gate (hazard H3, ADR-19);
//   - glare: at least a small share of the frame is clipped bright, which is what a
//     reflection off film or a screen does, and also what a blown-out light box does. It
//     cannot tell the two apart, so the remedy is a retake either way;
//   - blurred: low variance of the Laplacian. The sampling step scales with the image, so the
//     test measures focus at a fixed fraction of the frame instead of raw pixel size;
//   - not framed: a wide border on every side is plain background, so the film sits well
//     inside the frame. The capture protocol asks for a small border (TRD 7.4, Appendix C),
//     so the band is wide enough to leave a protocol-compliant border alone.
// Exposure and glare are checked before framing because they hide detail inside the film.
// A film photographed small on a bright background can therefore be reported as glare first.
// Every check samples a grid of about 256 x 256 points, so cost does not grow with the photo
// and the whole gate stays inside its 300 ms budget (NFR-PERF-03).

export const QUALITY_VERSION = 'quality-v2';
export const MIN_SIDE = 512;
export const BLANK_STD = 8;
export const DARK_MEAN = 40;
export const BRIGHT_MEAN = 220;
export const COLOURFUL_MAX = 30;
export const GLARE_LEVEL = 250;
export const GLARE_FRACTION_MAX = 0.02;
export const SHARPNESS_MIN = 50;
export const FLAT_TOLERANCE = 10;
export const BORDER_FLAT_MAX = 0.9;
export const BORDER_INTERIOR_MIN = 40;

/** Points per side of the sampling grid; keeps every check a fixed cost. */
const GRID = 256;

export type RetakeReason =
  | 'too_small'
  | 'blank'
  | 'too_dark'
  | 'too_bright'
  | 'not_xray'
  | 'glare'
  | 'blurred'
  | 'not_framed';

/** Every reason the gate can return, in the order the checks run. Strings exist for each (tested). */
export const RETAKE_REASONS: readonly RetakeReason[] = [
  'too_small', 'blank', 'too_dark', 'too_bright', 'not_xray', 'glare', 'blurred', 'not_framed',
];

export interface QualityResult {
  version: string;
  passed: boolean;
  reason: RetakeReason | null;
  width: number;
  height: number;
  mean: number;
  std: number;
  colourfulness: number;
  sharpness: number;
  glare_fraction: number;
  border_flat: number;
  interior_std: number;
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

/** Pixels to skip so the whole frame is covered by about GRID points per side. */
function sampleStep(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width, height) / GRID));
}

/**
 * Per-row start offset. A regular grid can line up with a fine repeating pattern, such as the
 * moire of a photo of a screen, and then every sample lands on the same phase. Shifting each
 * sampled row by a small co-prime amount keeps samples spread over the pattern.
 */
function rowOffset(row: number, s: number): number {
  return s > 1 ? (row * 7) % s : 0;
}

/** Mean and spread of brightness over the sampling grid. */
export function moments(gray: Uint8Array, width: number, height: number): { mean: number; std: number } {
  const s = sampleStep(width, height);
  let sum = 0, sq = 0, n = 0, r = 0;
  for (let y = 0; y < height; y += s, r++) {
    for (let x = rowOffset(r, s); x < width; x += s) {
      const v = gray[y * width + x];
      sum += v; sq += v * v; n++;
    }
  }
  if (!n) return { mean: 0, std: 0 };
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(sq / n - mean * mean, 0)) };
}

/**
 * Variance of the 4-neighbour Laplacian on a grid about GRID points per side. Focus detail at
 * one fixed fraction of the frame is what a retake can fix; raw pixel size is not. A soft
 * image scores low, a sharp one high.
 */
export function sharpness(gray: Uint8Array, width: number, height: number): number {
  const s = sampleStep(width, height);
  let sum = 0, sq = 0, n = 0, r = 0;
  for (let y = s; y < height - s; y += s, r++) {
    for (let x = s + rowOffset(r, s); x < width - s; x += s) {
      const i = y * width + x;
      const l = 4 * gray[i] - gray[i - s] - gray[i + s] - gray[i - s * width] - gray[i + s * width];
      sum += l; sq += l * l; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return Math.max(sq / n - mean * mean, 0);
}

/** Share of sampled pixels that are clipped bright. Light reflecting off film, a screen or a light box washes out everything it covers. */
export function glareFraction(gray: Uint8Array, width: number, height: number): number {
  const s = sampleStep(width, height);
  let hits = 0, n = 0, r = 0;
  for (let y = 0; y < height; y += s, r++) {
    for (let x = rowOffset(r, s); x < width; x += s) {
      n++;
      if (gray[y * width + x] >= GLARE_LEVEL) hits++;
    }
  }
  return n ? hits / n : 0;
}

/** Fraction of one edge band within FLAT_TOLERANCE of that band's median. */
function edgeFlatness(gray: Uint8Array, width: number, height: number, s: number, band: number, side: 'left' | 'right' | 'top' | 'bottom'): number {
  const vals: number[] = [];
  let r = 0;
  for (let y = 0; y < height; y += s, r++) {
    const edgeRow = side === 'top' ? y < band : side === 'bottom' ? y >= height - band : true;
    for (let x = rowOffset(r, s); x < width; x += s) {
      const edgeCol = side === 'left' ? x < band : side === 'right' ? x >= width - band : true;
      if (edgeRow && edgeCol) vals.push(gray[y * width + x]);
    }
  }
  if (!vals.length) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  let flat = 0;
  for (const v of vals) if (Math.abs(v - median) <= FLAT_TOLERANCE) flat++;
  return flat / vals.length;
}

/** Spread of brightness in the middle half, so a plain photo is not called badly framed. */
function interiorStd(gray: Uint8Array, width: number, height: number, s: number): number {
  const x0 = Math.floor(width * 0.25), x1 = Math.ceil(width * 0.75);
  const y0 = Math.floor(height * 0.25), y1 = Math.ceil(height * 0.75);
  let sum = 0, sq = 0, n = 0, r = 0;
  for (let y = y0; y < y1; y += s, r++) {
    for (let x = x0 + rowOffset(r, s); x < x1; x += s) {
      const v = gray[y * width + x];
      sum += v; sq += v * v; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return Math.sqrt(Math.max(sq / n - mean * mean, 0));
}

/**
 * Gate one image. `colour` is required on purpose: omitting it would silently disable the only
 * modality-related check, which fails open (NFR-SAFE-02, hazard H3).
 */
export function checkQuality(gray: Uint8Array, width: number, height: number, colour: number): QualityResult {
  // One grid for every check, so the numbers always agree with each other.
  const { mean, std } = moments(gray, width, height);
  const grid = sampleStep(width, height);
  const sharp = sharpness(gray, width, height);
  const glare = glareFraction(gray, width, height);
  // Wide enough that a protocol-compliant small border (TRD 7.4, Appendix C) stays out of it.
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.1));
  const border = Math.min(
    edgeFlatness(gray, width, height, grid, band, 'left'),
    edgeFlatness(gray, width, height, grid, band, 'right'),
    edgeFlatness(gray, width, height, grid, band, 'top'),
    edgeFlatness(gray, width, height, grid, band, 'bottom'),
  );
  const interior = interiorStd(gray, width, height, grid);

  let reason: RetakeReason | null = null;
  if (Math.min(width, height) < MIN_SIDE) reason = 'too_small';
  else if (std < BLANK_STD) reason = 'blank';
  else if (mean < DARK_MEAN) reason = 'too_dark';
  else if (mean > BRIGHT_MEAN) reason = 'too_bright';
  else if (colour >= COLOURFUL_MAX) reason = 'not_xray';
  else if (glare >= GLARE_FRACTION_MAX) reason = 'glare';
  else if (sharp < SHARPNESS_MIN) reason = 'blurred';
  else if (border >= BORDER_FLAT_MAX && interior >= BORDER_INTERIOR_MIN) reason = 'not_framed';

  return {
    version: QUALITY_VERSION,
    passed: reason === null,
    reason,
    width,
    height,
    mean,
    std,
    colourfulness: Math.round(colour * 10) / 10,
    sharpness: Math.round(sharp),
    glare_fraction: Math.round(glare * 1000) / 1000,
    border_flat: Math.round(border * 100) / 100,
    interior_std: Math.round(interior),
  };
}
