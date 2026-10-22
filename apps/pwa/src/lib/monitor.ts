// Turns saved records into the monitoring page's numbers (Prosit 2 C4). Pure and tested.
// The reference file (public/config/reference.json) holds the validation score histogram
// and training input-statistic histograms with their bin edges; until Chelsea fills it,
// the page shows live numbers only and says so.
import { PREPROCESS_VERSION } from './preprocess';
import type { InferenceRow } from './records';
import { histogram, percentile, psi } from './stats';

export const DRIFT_STATS = ['aspect_ratio', 'edge_energy', 'mean_brightness', 'width'] as const;
export type DriftStat = (typeof DRIFT_STATS)[number];

export interface Reference {
  status: 'pending' | 'set';
  score_hist_validation: number[] | null; // 10 equal bins over [0, 1]
  inputs: Partial<Record<DriftStat, { edges: number[]; counts: number[] }>> | null;
}

export interface Summary {
  total: number;
  qualityFailed: number;
  latencyP95: number | null;
  mismatches: number;
  last: string | null;
  scoreHist: number[];
  refHist: number[] | null;
  zones: Record<'refer_now' | 'unsure' | 'low_risk' | 'retake', number>;
  drift: { stat: DriftStat; psi: number | null; median: number | null }[];
  versions: { model: string[]; thresholds: string[]; preprocess: string[]; build: string[] };
}

/** Model time excludes decoding, quality checks and preprocessing. Old rows without a timer stay unknown. */
export function modelTimeMs(row: InferenceRow): number | null {
  const ms = row.device_info.timings?.model_ms;
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** Counts of `values` in the bins given by `edges` (length bins + 1); outside values go to the end bins. */
export function binByEdges(values: number[], edges: number[]): number[] {
  const counts = new Array<number>(edges.length - 1).fill(0);
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    let k = edges.findIndex((e, i) => i > 0 && v < e) - 1;
    if (k < 0) k = v < edges[0] ? 0 : counts.length - 1;
    counts[k]++;
  }
  return counts;
}

const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();

export function summarize(rows: InferenceRow[], ref: Reference | null): Summary {
  const scored = rows.filter((r) => r.zone !== 'retake' && typeof r.outputs.tb_probability === 'number');
  const probs = scored.map((r) => r.outputs.tb_probability as number);
  const stat = (k: DriftStat) =>
    scored.map((r) => Number(r.outputs.input_stats?.[k])).filter((v) => Number.isFinite(v));
  const zones = { refer_now: 0, unsure: 0, low_risk: 0, retake: 0 };
  for (const r of rows) if (r.zone in zones) zones[r.zone]++;
  const refSet = ref?.status === 'set';
  return {
    total: rows.length,
    qualityFailed: zones.retake,
    latencyP95: percentile(scored.map(modelTimeMs).filter((ms): ms is number => ms !== null), 95),
    mismatches: rows.filter((r) => r.device_info.preprocess !== PREPROCESS_VERSION).length,
    last: rows.reduce<string | null>((a, r) => (a && a > r.created_at ? a : r.created_at), null),
    scoreHist: histogram(probs, 10),
    refHist: refSet ? ref?.score_hist_validation ?? null : null,
    zones,
    drift: DRIFT_STATS.map((k) => {
      const live = stat(k);
      const r = refSet ? ref?.inputs?.[k] : undefined;
      return { stat: k, psi: r && live.length ? psi(binByEdges(live, r.edges), r.counts) : null, median: percentile(live, 50) };
    }),
    versions: {
      model: uniq(rows.map((r) => r.model_version)),
      thresholds: uniq(rows.map((r) => r.thresholds_version)),
      preprocess: uniq(rows.map((r) => r.device_info.preprocess)),
      build: uniq(rows.map((r) => r.device_info.app_build)),
    },
  };
}

export function toCsv(rows: InferenceRow[]): string {
  const head = ['created_at', 'zone', 'quality_passed', 'quality_reason', 'tb_probability', 'latency_ms', 'model_ms', 'aspect_ratio', 'mean_brightness', 'edge_energy', 'width', 'height', 'model_version', 'thresholds_version', 'preprocess', 'app_build'];
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => {
    const s = r.outputs.input_stats ?? {};
    return [r.created_at, r.zone, r.quality_scores.passed, r.quality_scores.reason, r.outputs.tb_probability, r.latency_ms, modelTimeMs(r), s.aspect_ratio, s.mean_brightness, s.edge_energy, s.width, s.height, r.model_version, r.thresholds_version, r.device_info.preprocess, r.device_info.app_build].map(cell).join(',');
  });
  return [head.join(','), ...lines].join('\n') + '\n';
}
