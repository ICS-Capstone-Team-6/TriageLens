// Referral numbers and the facility services editor (E10-09, adds to E10-02; ADR-28 section 6).
// Counts only, no patient identifiers. Pure helpers are tested in stats.test.ts.
import { supabase } from '../supabase';

// Counts from 1 to 4 arrive as null from the server ("fewer than 5") so a small clinic's
// single result cannot be picked out. Totals are summed on the server from real counts.
export type Count = number | null;

export interface Totals {
  sent: Count; arrived: Count; tested: Count; confirmed: Count; notArrived7d: Count;
  received: Count; ambRequests: Count; ambSeen10min: Count; ambDispatched: Count;
}

export interface WeekRow {
  week: string; // YYYY-MM-DD, Monday
  sent: Count; arrived: Count; received: Count; ambRequests: Count;
}

export interface FacilityStats {
  facilityId: string;
  facilityName: string;
  totals: Totals;
  weeks: WeekRow[];
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
  stats: (weeks: number) => Promise<FacilityStats[] | null>;
}

const count = (v: unknown): Count => (v === null || v === undefined ? null : typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseStats(rows: unknown): FacilityStats[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((x) => {
    const r = x as Record<string, unknown>;
    if (typeof r.facility_id !== 'string' || !r.totals || typeof r.totals !== 'object') return [];
    const t = r.totals as Record<string, unknown>;
    const weeks = (Array.isArray(r.weeks) ? r.weeks : []).flatMap((w) => {
      const o = w as Record<string, unknown>;
      return typeof o.week === 'string'
        ? [{ week: o.week, sent: count(o.sent), arrived: count(o.arrived), received: count(o.received), ambRequests: count(o.amb_requests) }]
        : [];
    });
    return [{
      facilityId: r.facility_id, facilityName: String(r.facility_name ?? ''), weeks,
      totals: {
        sent: count(t.sent), arrived: count(t.arrived), tested: count(t.tested), confirmed: count(t.confirmed),
        notArrived7d: count(t.not_arrived_7d), received: count(t.received), ambRequests: count(t.amb_requests),
        ambSeen10min: count(t.amb_seen_10min), ambDispatched: count(t.amb_dispatched),
      },
    }];
  });
}

/** "3 of 4 (75%)"; empty when either count is hidden or there is nothing to divide by. */
export function share(part: Count, whole: Count): { text: string; pct: number | null } {
  if (part === null || whole === null || whole <= 0) return { text: '', pct: null };
  const pct = Math.floor((part / whole) * 100);
  return { text: `${part} of ${whole} (${pct}%)`, pct };
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
