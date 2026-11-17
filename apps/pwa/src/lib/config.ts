// Loads the versioned thresholds file (ADR-20, TRD ML-CALIB-03). The file names the run ID
// and the SHA-256 of the exact model file it was set for (hazard H7); the app refuses
// results when the loaded model's hash differs. Until Chelsea's values
// are filled in, the file says "pending" and the app shows no results at all: no zone
// without valid thresholds. Signing the file (ADR-11) comes later; for v0 it is a plain,
// reviewed file in git.
import { validThresholds, type Thresholds } from './triage';

export interface ThresholdsFile {
  version: string;
  status: 'pending' | 'set';
  run_id: string;
  split: string;
  rule: { screen_out: string; refer: string };
  screen_out_probability: number | null;
  refer_probability: number | null;
  model_sha256: string | null;
}

export type ThresholdsState =
  | { ok: true; thresholds: Thresholds; runId: string; modelSha256: string }
  | { ok: false; reason: 'pending' | 'invalid' | 'unreachable' };

export function parseThresholds(file: unknown, expectedRunId: string): ThresholdsState {
  const f = file as Partial<ThresholdsFile> | null;
  if (!f || typeof f !== 'object' || typeof f.version !== 'string') return { ok: false, reason: 'invalid' };
  if (f.status !== 'set' || f.screen_out_probability == null || f.refer_probability == null || !f.model_sha256) return { ok: false, reason: 'pending' };
  if (f.run_id !== expectedRunId) return { ok: false, reason: 'invalid' };
  const t = { version: f.version, screenOut: Number(f.screen_out_probability), refer: Number(f.refer_probability) };
  if (!validThresholds(t)) return { ok: false, reason: 'invalid' };
  return { ok: true, thresholds: t, runId: f.run_id, modelSha256: f.model_sha256.toLowerCase() };
}

export async function loadThresholds(expectedRunId: string): Promise<ThresholdsState> {
  try {
    const r = await fetch('/config/thresholds.json', { cache: 'no-store' });
    if (!r.ok) return { ok: false, reason: 'unreachable' };
    return parseThresholds(await r.json(), expectedRunId);
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
