// Input statistics recorded with every result, and the maths the monitoring page uses.
// The statistics are numbers only: no pixels leave the phone (ADR-10, ADR-19).
// They watch the risks found in training: image shape (ADR-16), texture (ADR-16
// follow-up), brightness and an upstream format change (the stale-feed case).

export const STATS_VERSION = 'input-stats-v1';

export interface InputStats {
  version: string;
  width: number;
  height: number;
  aspect_ratio: number; // width / height of the original image
  mean_brightness: number; // 0-255, on the 320 x 320 model input
  edge_energy: number; // mean absolute 4-neighbour Laplacian / 255, on the model input
}

export function inputStats(small: Uint8Array, size: number, width: number, height: number): InputStats {
  let sum = 0;
  for (let i = 0; i < small.length; i++) sum += small[i];
  let lap = 0, n = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      lap += Math.abs(4 * small[i] - small[i - 1] - small[i + 1] - small[i - size] - small[i + size]);
      n++;
    }
  }
  return {
    version: STATS_VERSION,
    width,
    height,
    aspect_ratio: round(width / height, 4),
    mean_brightness: round(sum / small.length, 2),
    edge_energy: round(n ? lap / n / 255 : 0, 5),
  };
}

export function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Nearest-rank percentile; returns null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * s.length);
  return s[Math.min(Math.max(rank, 1), s.length) - 1];
}

/** Counts in `bins` equal-width bins over [lo, hi]; values outside are clamped into the end bins. */
export function histogram(values: number[], bins = 10, lo = 0, hi = 1): number[] {
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const k = Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)));
    counts[k]++;
  }
  return counts;
}

/**
 * Population stability index between a live and a reference histogram:
 * PSI = sum over bins of (live - ref) * ln(live / ref), on proportions.
 * Empty bins get a small floor so the log stays finite. 0.2 or more is the usual alert line.
 * Returns null when either side has no data.
 */
export function psi(live: number[], ref: number[], floor = 1e-4): number | null {
  const ln = live.reduce((a, b) => a + b, 0);
  const rn = ref.reduce((a, b) => a + b, 0);
  if (!ln || !rn || live.length !== ref.length) return null;
  let s = 0;
  for (let i = 0; i < live.length; i++) {
    const a = Math.max(live[i] / ln, floor);
    const b = Math.max(ref[i] / rn, floor);
    s += (a - b) * Math.log(a / b);
  }
  return s;
}
