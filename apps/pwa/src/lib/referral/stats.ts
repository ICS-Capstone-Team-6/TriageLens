// Referral numbers and the facility services editor (E10-09, adds to E10-02; ADR-28 section 6).
// Counts only, no patient identifiers. Pure helpers are tested in stats.test.ts.
import { supabase } from '../supabase';

export interface WeekRow {
  week: string; // YYYY-MM-DD, Monday
  facilityId: string;
  facilityName: string;
  sent: number;
  arrived: number;
  tested: number;
  confirmed: number;
  notArrived7d: number;
  received: number;
  ambRequests: number;
  ambSeen10min: number;
  ambDispatched: number;
}

export interface MyFacility {
  id: string;
  name: string;
  phone: string;
  services: string[];
  servicesConfirmedAt: string | null;
}

export interface FacilityDeps {
  role: () => Promise<string | null>;
  myFacility: () => Promise<MyFacility | null>;
  saveServices: (id: string, services: string[], phone: string) => Promise<MyFacility | null>;
  stats: (weeks: number) => Promise<WeekRow[] | null>;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export function parseStats(rows: unknown): WeekRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((x) => {
    const r = x as Record<string, unknown>;
    if (typeof r.week !== 'string' || typeof r.facility_id !== 'string') return [];
    return [{
      week: r.week, facilityId: r.facility_id, facilityName: String(r.facility_name ?? ''),
      sent: num(r.sent), arrived: num(r.arrived), tested: num(r.tested), confirmed: num(r.confirmed),
      notArrived7d: num(r.not_arrived_7d), received: num(r.received), ambRequests: num(r.amb_requests),
      ambSeen10min: num(r.amb_seen_10min), ambDispatched: num(r.amb_dispatched),
    }];
  });
}

/** Sums the weeks of one facility. */
export function totals(rows: WeekRow[]): Omit<WeekRow, 'week' | 'facilityId' | 'facilityName'> {
  const z = { sent: 0, arrived: 0, tested: 0, confirmed: 0, notArrived7d: 0, received: 0, ambRequests: 0, ambSeen10min: 0, ambDispatched: 0 };
  for (const r of rows) for (const k of Object.keys(z) as (keyof typeof z)[]) z[k] += r[k];
  return z;
}

/** "3 of 4 (75%)"; "none yet" when there is nothing to divide by. Whole percent, rounded down. */
export function share(part: number, whole: number): { text: string; pct: number | null } {
  if (whole <= 0) return { text: '', pct: null };
  const pct = Math.floor((part / whole) * 100);
  return { text: `${part} of ${whole} (${pct}%)`, pct };
}

export function byFacility(rows: WeekRow[]): Map<string, WeekRow[]> {
  const m = new Map<string, WeekRow[]>();
  for (const r of rows) m.set(r.facilityId, [...(m.get(r.facilityId) ?? []), r]);
  return m;
}

function parseFacility(d: unknown): MyFacility | null {
  const r = d as Record<string, unknown> | null;
  if (!r || typeof r.id !== 'string') return null;
  return {
    id: r.id, name: String(r.name ?? ''), phone: String(r.phone ?? ''),
    services: Array.isArray(r.services) ? r.services.filter((s): s is string => typeof s === 'string') : [],
    servicesConfirmedAt: typeof r.services_confirmed_at === 'string' ? r.services_confirmed_at : null,
  };
}

export const realFacility: FacilityDeps = {
  async role() {
    if (!supabase) return null;
    const { data } = await supabase.rpc('my_role');
    return (data as { role?: string } | null)?.role ?? null;
  },
  async myFacility() {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('my_facility');
    return error ? null : parseFacility(data);
  },
  async saveServices(id, services, phone) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('update_facility_services', { p_facility_id: id, p_services: services, p_phone: phone });
    return error ? null : parseFacility(data);
  },
  async stats(weeks) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('referral_stats', { p_weeks: weeks });
    return error ? null : parseStats(data);
  },
};
