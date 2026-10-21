// Development-only demo mode (`?demo`, import.meta.env.DEV). Lets the team click through the
// real screens before the model file and thresholds exist. A stand-in replaces the model and
// returns the outcome chosen in the demo bar; every screen shows a "made up" banner. Nothing
// is saved to the backend. Production builds never import this file (see main.tsx).
import type { Ready } from '../inference/client';
import type { Screened } from '../inference/messages';
import type { InferenceRow } from '../lib/records';
import type { Thresholds, Zone } from '../lib/triage';

export type DemoOutcome = 'refer_now' | 'unsure' | 'low_risk' | 'retake';

export const DEMO_THRESHOLDS: Thresholds = { version: 'demo-only', screenOut: 0.3, refer: 0.7 };
export const DEMO_SHA = '0'.repeat(64);

// Logits that land in each zone under DEMO_THRESHOLDS; the real zone logic still decides.
const LOGIT: Record<Exclude<DemoOutcome, 'retake'>, number> = { refer_now: 2.2, unsure: 0, low_risk: -2.2 };

let next: DemoOutcome = 'unsure';
const listeners = new Set<() => void>();
export const demoRows: InferenceRow[] = [];

export function getOutcome(): DemoOutcome { return next; }
export function setOutcome(o: DemoOutcome) { next = o; listeners.forEach((f) => f()); }
export function onOutcome(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoClient {
  async init(): Promise<Ready> {
    await wait(300);
    return { threads: 1, modelSha256: DEMO_SHA, crossOriginIsolated: false };
  }

  async screen(_file: Blob, onProgress: (step: 1 | 2) => void): Promise<Screened> {
    const o = next;
    await wait(500);
    const timings = { decode_ms: 120, preprocess_ms: 0, model_ms: 0 };
    if (o === 'retake') {
      return {
        type: 'screened', preprocess: 'cxr-pre-2', threads: 1, timings, stats: null, logit: null,
        quality: { version: 'quality-v1', passed: false, reason: 'too_dark', width: 1600, height: 1800, mean: 22, std: 30, colourfulness: 2 },
      };
    }
    onProgress(1);
    await wait(500);
    onProgress(2);
    await wait(800);
    return {
      type: 'screened', preprocess: 'cxr-pre-2', threads: 1,
      timings: { decode_ms: 120, preprocess_ms: 60, model_ms: 900 + Math.round(Math.random() * 600) },
      quality: { version: 'quality-v1', passed: true, reason: null, width: 1600, height: 1800, mean: 128, std: 52, colourfulness: 3 },
      stats: { version: 'input-stats-v1', width: 1600, height: 1800, aspect_ratio: 0.8889, mean_brightness: 126 + Math.round(Math.random() * 10), edge_energy: 0.05 + Math.random() * 0.02 },
      logit: LOGIT[o] + (Math.random() - 0.5) * 0.4,
    };
  }
}

/** Keeps demo screenings in memory so the monitoring page has something to show. */
export function recordDemo(s: Screened, zone: Zone, probability: number | null, totalMs: number) {
  demoRows.unshift({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    model_version: 'demo-stand-in',
    thresholds_version: DEMO_THRESHOLDS.version,
    zone,
    latency_ms: totalMs,
    outputs: { tb_logit: s.logit, tb_probability: probability, input_stats: s.stats as unknown as Record<string, number> | null },
    quality_scores: { passed: s.quality.passed, reason: s.quality.reason },
    device_info: { preprocess: s.preprocess, app_build: 'demo' },
  });
}
