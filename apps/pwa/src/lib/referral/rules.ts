// Referral service rules (ADR-28, E10-06). The table lives in a versioned file
// (rules.v1.json), never in code, like the thresholds file (TRD 7.2). It maps a
// condition and zone to the services a facility must have. It is a demo draft until a
// clinician signs it off; the app shows that status. Pure and tested: rules.test.ts.
import type { Zone } from '../triage';
import rulesFile from './rules.v1.json';

// Keep in step with the facilities.services check in
// supabase/migrations/20261125120000_e10_06_facility_directory.sql.
export const SERVICE_TAGS = [
  'tb_rapid_test', 'tb_treatment', 'chest_xray', 'oxygen', 'inpatient',
  'eye_clinic', 'retina_laser', 'retina_injection', 'ambulance',
] as const;
export type ServiceTag = (typeof SERVICE_TAGS)[number];

export const CONDITIONS = ['tb', 'pneumonia', 'dr'] as const;
export type Condition = (typeof CONDITIONS)[number];

// Ordered from most to least urgent; a referral takes the most urgent of its conditions.
export const URGENCIES = ['same_day', 'days', 'weeks'] as const;
export type Urgency = (typeof URGENCIES)[number];

export interface Rule {
  condition: Condition;
  zones: Zone[];
  needs: ServiceTag[];
  prefers: ServiceTag[];
  urgency: Urgency;
  enabled: boolean;
  basis: string;
}

export interface Rules {
  version: string;
  status: 'demo_draft' | 'signed_off';
  signedOffBy: string | null;
  signedOffOn: string | null;
  staleAfterDays: number;
  maxDistanceKm: number;
  rules: Rule[];
}

const REFERRAL_ZONES: readonly Zone[] = ['refer_now', 'unsure'];

const isTag = (t: unknown): t is ServiceTag => typeof t === 'string' && (SERVICE_TAGS as readonly string[]).includes(t);
const isTagList = (v: unknown): v is ServiceTag[] => Array.isArray(v) && v.every(isTag);

// Returns null for any malformed file. The caller then offers the full facility list
// with no filtering, so a broken file can never hide a referral.
export function parseRules(file: unknown): Rules | null {
  const f = file as Record<string, unknown> | null;
  if (!f || typeof f !== 'object' || typeof f.version !== 'string' || !f.version) return null;
  if (f.status !== 'demo_draft' && f.status !== 'signed_off') return null;
  const signedBy = f.signed_off_by ?? null;
  const signedOn = f.signed_off_on ?? null;
  if (signedBy !== null && typeof signedBy !== 'string') return null;
  if (signedOn !== null && typeof signedOn !== 'string') return null;
  // A signed-off file must name who signed it and when.
  if (f.status === 'signed_off' && (!signedBy || !signedOn)) return null;
  const stale = Number(f.stale_after_days);
  const maxKm = Number(f.max_distance_km);
  if (!Number.isFinite(stale) || stale <= 0 || !Number.isFinite(maxKm) || maxKm <= 0) return null;
  if (!Array.isArray(f.rules)) return null;
  const rules: Rule[] = [];
  const seen = new Set<string>();
  for (const raw of f.rules as unknown[]) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r !== 'object') return null;
    if (!(CONDITIONS as readonly unknown[]).includes(r.condition)) return null;
    if (!Array.isArray(r.zones) || r.zones.length === 0 || !r.zones.every((z) => REFERRAL_ZONES.includes(z as Zone))) return null;
    if (!isTagList(r.needs) || r.needs.length === 0 || !isTagList(r.prefers)) return null;
    if (!(URGENCIES as readonly unknown[]).includes(r.urgency)) return null;
    if (typeof r.enabled !== 'boolean' || typeof r.basis !== 'string') return null;
    for (const z of r.zones as Zone[]) {
      const key = `${r.condition}:${z}`;
      if (seen.has(key)) return null; // one rule per condition and zone
      seen.add(key);
    }
    rules.push({
      condition: r.condition as Condition, zones: r.zones as Zone[], needs: r.needs, prefers: r.prefers,
      urgency: r.urgency as Urgency, enabled: r.enabled, basis: r.basis,
    });
  }
  return {
    version: f.version, status: f.status, signedOffBy: signedBy, signedOffOn: signedOn,
    staleAfterDays: stale, maxDistanceKm: maxKm, rules,
  };
}

export const RULES_V1: Rules | null = parseRules(rulesFile);

export interface ConditionResult {
  condition: Condition;
  zone: Zone;
}

export type Needs =
  | { kind: 'no_referral' }
  // A condition in a referral zone has no enabled rule: show the full list, unfiltered.
  | { kind: 'no_rule'; conditions: Condition[] }
  | { kind: 'needs'; needs: ServiceTag[]; prefers: ServiceTag[]; urgency: Urgency; conditions: Condition[] };

// Low risk and retake never create a referral (a retake has no zone). Refer now and
// unsure do, because uncertainty moves toward refer (TRD 7.2).
export function needsFor(results: ConditionResult[], rules: Rules): Needs {
  const referring = results.filter((r) => REFERRAL_ZONES.includes(r.zone));
  if (referring.length === 0) return { kind: 'no_referral' };
  const needs = new Set<ServiceTag>();
  const prefers = new Set<ServiceTag>();
  const missing: Condition[] = [];
  let urgency: Urgency | null = null;
  for (const r of referring) {
    const rule = rules.rules.find((x) => x.enabled && x.condition === r.condition && x.zones.includes(r.zone));
    if (!rule) { missing.push(r.condition); continue; }
    rule.needs.forEach((t) => needs.add(t));
    rule.prefers.forEach((t) => prefers.add(t));
    if (urgency === null || URGENCIES.indexOf(rule.urgency) < URGENCIES.indexOf(urgency)) urgency = rule.urgency;
  }
  if (missing.length > 0 || urgency === null) return { kind: 'no_rule', conditions: [...new Set(missing)] };
  needs.forEach((t) => prefers.delete(t));
  return {
    kind: 'needs', needs: [...needs].sort(), prefers: [...prefers].sort(), urgency,
    conditions: [...new Set(referring.map((r) => r.condition))],
  };
}
