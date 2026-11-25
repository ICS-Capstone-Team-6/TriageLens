// Referral data access (E10-03, E10-06). The facility directory is cached on the phone so
// the "Choose facility" screen works with no signal (ADR-28). Sending a referral needs
// signal for now; it moves to the sync outbox when E9-02 lands. Pure helpers are tested
// in api.test.ts.
import { supabase } from '../supabase';
import { parseDirectory, type DistanceBand, type Facility } from './match';
import type { Condition, Urgency } from './rules';

const CACHE_KEY = 'triagelens.directory.v1';

export interface DirectoryCache {
  savedAt: string;
  facilities: Facility[];
}

export interface ReferralDraft {
  id: string;
  caseId: string;
  toFacility: string;
  conditions: Condition[];
  urgency: Urgency | null;
  rulesVersion: string;
  distanceBand: DistanceBand | null;
  initials: string; // '' when the worker leaves it blank; see toInitials
}

export interface SentReferral {
  id: string;
  code: string;
  initials: string;
  expiresAt: string;
}

// Letters in Ghanaian names that are not plain A to Z (Akan, Ewe, Ga) mapped to their
// nearest plain letter, so initials stay readable over the phone.
const LETTER_MAP: Record<string, string> = { Ɛ: 'E', ɛ: 'E', Ɔ: 'O', ɔ: 'O', Ŋ: 'N', ŋ: 'N', Ʋ: 'V', ʋ: 'V', Ƒ: 'F', ƒ: 'F', Ɖ: 'D', ɖ: 'D' };

function plainUpper(s: string): string {
  return [...s].map((ch) => LETTER_MAP[ch] ?? ch).join('')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Initials for the referral code: the first letter of each name, at most 4.
 * Accepts initials ("KAM") or names ("Kofi Ama Mensah"); the names are never kept or sent.
 */
export function toInitials(input: string): string {
  const words = input.trim().split(/[\s\-.]+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 4 && !/[a-z]/.test(words[0])) return plainUpper(words[0]).slice(0, 4);
  return words.map((w) => plainUpper(w).charAt(0)).join('').slice(0, 4);
}

export function referralPayload(d: ReferralDraft) {
  return {
    id: d.id,
    case_id: d.caseId,
    to_facility: d.toFacility,
    conditions: d.conditions,
    urgency: d.urgency,
    rules_version: d.rulesVersion,
    distance_band: d.distanceBand,
    initials: d.initials,
  };
}

const RANDOM = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

export function parseSent(row: unknown): SentReferral | null {
  const r = row as Record<string, unknown> | null;
  if (!r || typeof r.id !== 'string' || typeof r.code !== 'string' || r.code.length !== 8) return null;
  const initials = typeof r.initials === 'string' ? r.initials : '';
  if (!/^[A-Z]{0,4}$/.test(initials) || !r.code.startsWith(initials) || !RANDOM.test(r.code.slice(initials.length))) return null;
  return { id: r.id, code: r.code, initials, expiresAt: typeof r.expires_at === 'string' ? r.expires_at : '' };
}

/** Initials, then the random part, easier to read aloud: "KAA 7QM4X". No initials: "ABCD EFGH". */
export function formatCode(code: string, initials = ''): string {
  if (code.length !== 8) return code;
  if (initials && code.startsWith(initials)) return `${initials} ${code.slice(initials.length)}`;
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

export function readCache(raw: string | null): DirectoryCache | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as { savedAt?: unknown; facilities?: unknown };
    if (typeof c.savedAt !== 'string' || !Array.isArray(c.facilities)) return null;
    // Cached rows went through parseDirectory once; re-check their shape anyway.
    const facilities = parseDirectory(c.facilities.map((f: Facility) => ({
      id: f.id, name: f.name, district: f.district, region: f.region, lat: f.lat, lng: f.lng, phone: f.phone,
      opening_hours: f.openingHours, services: f.services, services_confirmed_at: f.servicesConfirmedAt,
    })));
    return { savedAt: c.savedAt, facilities };
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Fresh directory when online, the cached copy when not. `null` only if neither exists. */
export async function loadDirectory(): Promise<DirectoryCache | null> {
  const store = storage();
  if (supabase) {
    const { data, error } = await supabase.rpc('list_referral_facilities');
    if (!error) {
      const fresh: DirectoryCache = { savedAt: new Date().toISOString(), facilities: parseDirectory(data) };
      try { store?.setItem(CACHE_KEY, JSON.stringify(fresh)); } catch { /* storage full or blocked: still usable now */ }
      return fresh;
    }
  }
  let raw: string | null = null;
  try { raw = store?.getItem(CACHE_KEY) ?? null; } catch { raw = null; }
  return readCache(raw);
}

export async function loadOwnFacilityId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('facility_id').single();
  return data?.facility_id ?? null;
}

export async function sendReferral(d: ReferralDraft): Promise<SentReferral | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('create_referral', { p_referral: referralPayload(d) });
  if (error) return null;
  return parseSent(data);
}
