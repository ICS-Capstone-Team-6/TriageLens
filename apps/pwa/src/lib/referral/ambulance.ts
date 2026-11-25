// Ambulance request (E10-08, ADR-28 section 5; hazards H18, H19).
// The health worker decides; the app never suggests an ambulance. The call button always
// comes first. Offline, a request is refused at once and never queued, so nobody waits
// on a request that was never sent. Pure helpers are tested in ambulance.test.ts.
import { supabase } from '../supabase';

export const REASONS = ['cannot_walk', 'breathing_hard', 'very_weak', 'confused', 'other'] as const;
export type Reason = (typeof REASONS)[number];
export type AmbStatus = 'requested' | 'seen' | 'dispatched' | 'cannot_send' | 'cancelled';
export const ETAS = [15, 30, 45, 60, 90, 120] as const;
export const NOT_SEEN_MINUTES = 10;
export const POLL_MS = 15_000;

export interface AmbulanceRequest {
  id: string;
  referralId: string;
  code: string;
  initials: string;
  reason: Reason;
  note: string;
  status: AmbStatus;
  etaMinutes: number | null;
  answerNote: string;
  fromName: string;
  fromPhone: string;
  toName: string;
  toPhone: string;
  createdAt: string;
  seenAt: string | null;
  answeredAt: string | null;
}

export type RequestResult = { kind: 'ok'; request: AmbulanceRequest } | { kind: 'offline' } | { kind: 'already_open' } | { kind: 'failed' };

export interface AmbulanceDeps {
  list: (direction: 'sent' | 'received') => Promise<AmbulanceRequest[] | null>;
  request: (r: { id: string; referralId: string; reason: Reason; note: string }) => Promise<RequestResult>;
  answer: (id: string, status: 'seen' | 'dispatched' | 'cannot_send', eta?: number, note?: string) => Promise<AmbulanceRequest | null>;
  cancel: (id: string) => Promise<AmbulanceRequest | null>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const STATUSES: readonly AmbStatus[] = ['requested', 'seen', 'dispatched', 'cannot_send', 'cancelled'];

export function parseRequest(raw: unknown): AmbulanceRequest | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.id !== 'string' || !STATUSES.includes(r.status as AmbStatus) || !REASONS.includes(r.reason as Reason)) return null;
  return {
    id: r.id,
    referralId: str(r.referral_id),
    code: str(r.code),
    initials: str(r.initials),
    reason: r.reason as Reason,
    note: str(r.note),
    status: r.status as AmbStatus,
    etaMinutes: typeof r.eta_minutes === 'number' ? r.eta_minutes : null,
    answerNote: str(r.answer_note),
    fromName: str(r.from_name),
    fromPhone: str(r.from_phone),
    toName: str(r.to_name),
    toPhone: str(r.to_phone),
    createdAt: str(r.created_at),
    seenAt: typeof r.seen_at === 'string' ? r.seen_at : null,
    answeredAt: typeof r.answered_at === 'string' ? r.answered_at : null,
  };
}

export const isOpen = (a: Pick<AmbulanceRequest, 'status'>) => a.status === 'requested' || a.status === 'seen';

/** Requested, not seen, and older than 10 minutes: tell the sender to call (H18). */
export function notSeenTooLong(a: Pick<AmbulanceRequest, 'status' | 'createdAt'>, now: Date): boolean {
  const t = Date.parse(a.createdAt);
  return a.status === 'requested' && Number.isFinite(t) && now.getTime() - t >= NOT_SEEN_MINUTES * 60_000;
}

export function minutesSince(iso: string, now: Date): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 60_000)) : 0;
}

/** Requests that are new since the last look, for a notification on the receiving phone. */
export function newOpenIds(before: Set<string>, now: AmbulanceRequest[]): string[] {
  return now.filter((a) => a.status === 'requested' && !before.has(a.id)).map((a) => a.id);
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export const realAmbulance: AmbulanceDeps = {
  async list(direction) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('list_ambulance_requests', { p_direction: direction, p_limit: 50 });
    if (error || !Array.isArray(data)) return null;
    return data.map(parseRequest).filter((a): a is AmbulanceRequest => a !== null);
  },
  async request(r) {
    if (!supabase || !online()) return { kind: 'offline' };
    const { data, error } = await supabase.rpc('request_ambulance', {
      p: { id: r.id, referral_id: r.referralId, reason: r.reason, note: r.note.trim() } as never,
    });
    if (error) {
      if (/already open/i.test(error.message)) return { kind: 'already_open' };
      return /fetch|network/i.test(error.message) ? { kind: 'offline' } : { kind: 'failed' };
    }
    const req = parseRequest(data);
    return req ? { kind: 'ok', request: req } : { kind: 'failed' };
  },
  async answer(id, status, eta, note) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('answer_ambulance', { p_id: id, p_status: status, p_eta: eta ?? undefined, p_note: note ?? undefined });
    return error ? null : parseRequest(data);
  },
  async cancel(id) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('cancel_ambulance', { p_id: id });
    return error ? null : parseRequest(data);
  },
};

/** A phone notification while the app is open or in the background, if staff allowed it. */
export async function notifyNewRequest(title: string, body: string): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag: 'ambulance', requireInteraction: true });
    else new Notification(title, { body, tag: 'ambulance' });
  } catch {
    /* notifications are a convenience; the dashboard still shows the request */
  }
}
