// Saves one screening as a case plus one inference through Nana Yaw's RPCs, and reads
// them back for the monitoring page. Numbers only: no image, no name, no patient ID
// (ADR-10, ADR-19). Every record keeps model, threshold and preprocessing versions (FR-12).
import type { Screened } from '../inference/messages';
import { supabase } from './supabase';
import type { Zone } from './triage';

export const MODEL_NAME = 'cxr-tb';
export const MODEL_RUN = 'efficientnet_lite0_seed1_20261021T114608Z';
export const APP_BUILD = (import.meta.env.VITE_APP_BUILD as string | undefined) ?? 'dev';

export type AgeBand = '15-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';

export interface SaveInput {
  ageBand: AgeBand;
  screened: Screened;
  zone: Zone;
  probability: number | null;
  thresholdsVersion: string;
  modelSha256: string;
  totalMs: number;
}

export async function saveScreening(s: SaveInput): Promise<boolean> {
  if (!supabase) return false;
  const caseId = crypto.randomUUID();
  const { error: caseError } = await supabase.rpc('save_case', {
    p_case: { id: caseId, age_band: s.ageBand, status: 'open', notes: 'M2 slice screening', client_version: 1 },
  });
  if (caseError) return false;
  const { error } = await supabase.rpc('append_inference', {
    p_inference: {
      id: crypto.randomUUID(),
      case_id: caseId,
      model_name: MODEL_NAME,
      model_version: MODEL_RUN,
      thresholds_version: s.thresholdsVersion,
      outputs: {
        tb_logit: s.screened.logit,
        tb_probability: s.probability,
        input_stats: s.screened.stats,
      },
      zone: s.zone,
      quality_scores: s.screened.quality,
      latency_ms: Math.round(s.totalMs),
      device_info: {
        preprocess: s.screened.preprocess,
        app_build: APP_BUILD,
        model_sha256: s.modelSha256,
        threads: s.screened.threads,
        timings: s.screened.timings,
      },
    },
  });
  return !error;
}

export interface InferenceRow {
  id: string;
  created_at: string;
  model_version: string;
  thresholds_version: string;
  zone: Zone;
  latency_ms: number;
  outputs: { tb_logit?: number | null; tb_probability?: number | null; input_stats?: Record<string, number> | null };
  quality_scores: { passed?: boolean; reason?: string | null };
  device_info: { preprocess?: string; app_build?: string; timings?: { model_ms?: number } };
}

/** Latest inferences for the signed-in member's clinic (at most `limit` cases). */
export async function loadInferences(limit = 100): Promise<InferenceRow[] | null> {
  if (!supabase) return null;
  const { data: cases, error } = await supabase.rpc('list_cases', { p_limit: limit, p_offset: 0 });
  if (error || !Array.isArray(cases)) return null;
  const rows: InferenceRow[] = [];
  for (const c of cases as { id: string }[]) {
    const { data } = await supabase.rpc('get_case', { p_case_id: c.id });
    const inf = (data as { inferences?: InferenceRow[] } | null)?.inferences;
    if (Array.isArray(inf)) rows.push(...inf);
  }
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
