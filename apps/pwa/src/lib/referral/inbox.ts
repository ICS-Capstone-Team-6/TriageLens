// Referral inbox and follow-up (E10-04, E10-05; ADR-22, ADR-28). The receiving facility
// looks a referral up by code, marks arrival and records the confirmation test outcome;
// the sender sees the outcome (closed loop). Status only moves forward (H15). Pure
// helpers are tested in inbox.test.ts.
import { supabase } from '../supabase';
import type { Zone } from '../triage';

export const STATUSES = ['created', 'seen', 'arrived', 'tested', 'closed'] as const;
export type Status = (typeof STATUSES)[number];
export const OUTCOMES = ['confirmed', 'not_confirmed', 'not_done'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface ReferralSummary {
  id: string;
  code: string;
  initials: string;
  status: Status;
  outcome: Outcome | null;
  fromFacility: string;
  fromName: string;
  toFacility: string;
  toName: string;
  conditions: string[];
  urgency: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ReferralDetail {
  referral: ReferralSummary & { fromPhone: string; toPhone: string };
  ageBand: string | null;
  sex: string | null;
  symptoms: string[]; // keys ticked true
  results: { zone: Zone; modelVersion: string; thresholdsVersion: string; createdAt: string }[];
  events: { status: Status; note: string; at: string }[];
}

export interface InboxDeps {
  list: (direction: 'sent' | 'received') => Promise<ReferralSummary[] | null>;
  lookup: (code: string) => Promise<ReferralDetail | null | 'locked'>;
  open: (id: string) => Promise<ReferralDetail | null>;
  advance: (id: string, status: Exclude<Status, 'created'>, outcome?: Outcome, note?: string) => Promise<ReferralDetail | null>;
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const isStatus = (v: unknown): v is Status => (STATUSES as readonly unknown[]).includes(v);
const isOutcome = (v: unknown): v is Outcome => (OUTCOMES as readonly unknown[]).includes(v);
const ZONES: readonly Zone[] = ['refer_now', 'unsure', 'low_risk', 'retake'];

export function parseSummary(raw: unknown): ReferralSummary | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.id !== 'string' || typeof r.code !== 'string' || !isStatus(r.status)) return null;
  return {
    id: r.id,
    code: r.code,
    initials: str(r.initials),
    status: r.status,
    outcome: isOutcome(r.outcome) ? r.outcome : null,
    fromFacility: str(r.from_facility),
    fromName: str(r.from_name),
    toFacility: str(r.to_facility),
    toName: str(r.to_name),
    conditions: Array.isArray(r.conditions) ? r.conditions.filter((c): c is string => typeof c === 'string') : [],
    urgency: typeof r.urgency === 'string' ? r.urgency : null,
    createdAt: str(r.created_at),
    expiresAt: str(r.expires_at),
  };
}

export function parseDetail(raw: unknown): ReferralDetail | null {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  const ref = d.referral as Record<string, unknown> | undefined;
  const summary = parseSummary(ref);
  if (!summary || !ref) return null;
  const c = (d.case ?? {}) as Record<string, unknown>;
  const symptoms = c.symptoms && typeof c.symptoms === 'object'
    ? Object.entries(c.symptoms as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k).sort()
    : [];
  const results = (Array.isArray(d.inferences) ? d.inferences : []).flatMap((x) => {
    const i = x as Record<string, unknown>;
    if (!ZONES.includes(i.zone as Zone)) return [];
    return [{ zone: i.zone as Zone, modelVersion: str(i.model_version), thresholdsVersion: str(i.thresholds_version), createdAt: str(i.created_at) }];
  });
  const events = (Array.isArray(d.events) ? d.events : []).flatMap((x) => {
    const e = x as Record<string, unknown>;
    return isStatus(e.status) ? [{ status: e.status, note: str(e.note), at: str(e.occurred_at) }] : [];
  });
  return {
    referral: { ...summary, fromPhone: str(ref.from_phone), toPhone: str(ref.to_phone) },
    ageBand: typeof c.age_band === 'string' ? c.age_band : null,
    sex: typeof c.sex === 'string' ? c.sex : null,
    symptoms,
    results,
    events,
  };
}

const DAY_MS = 86_400_000;
export const NOT_ARRIVED_DAYS = 7;

/** Sent, not yet arrived, and older than 7 days: the sender should follow up (ADR-22). */
export function notArrived(r: Pick<ReferralSummary, 'status' | 'createdAt'>, now: Date): boolean {
  const created = Date.parse(r.createdAt);
  return (r.status === 'created' || r.status === 'seen') && Number.isFinite(created) && now.getTime() - created > NOT_ARRIVED_DAYS * DAY_MS;
}

/** What the receiving facility can do next. Nothing after closed; never backwards. */
export function nextActions(status: Status): ('arrived' | 'tested' | 'closed')[] {
  switch (status) {
    case 'created':
    case 'seen': return ['arrived', 'closed'];
    case 'arrived': return ['tested', 'closed'];
    case 'tested': return ['closed'];
    default: return [];
  }
}

export const realInbox: InboxDeps = {
  async list(direction) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('list_referrals', { p_direction: direction, p_limit: 100 });
    if (error || !Array.isArray(data)) return null;
    return data.map(parseSummary).filter((r): r is ReferralSummary => r !== null);
  },
  async lookup(code) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('lookup_referral', { p_code: code });
    if (error) return error.code === '42501' && /Too many tries/.test(error.message) ? 'locked' : null;
    return parseDetail(data);
  },
  async open(id) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('get_referral', { p_id: id });
    return error ? null : parseDetail(data);
  },
  async advance(id, status, outcome, note) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('advance_referral', {
      p_id: id, p_status: status, p_outcome: outcome ?? undefined, p_note: note ?? undefined,
    });
    return error ? null : parseDetail(data);
  },
};
