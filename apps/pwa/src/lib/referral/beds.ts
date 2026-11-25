// Free beds at a receiving facility (E10-10). Keep in step with
// supabase/migrations/20261126120000_e10_10_facility_beds.sql (private.beds_block):
//  * total 0 means no beds listed (outpatient only): never blocked, nothing shown;
//  * a count from the last 24 hours with LOW_BEDS or fewer free blocks a new referral;
//  * an older count never blocks; the app asks the worker to call first, because an old
//    number must not stop a referral that may be needed (uncertainty moves toward refer).
// LOW_BEDS is a demo default awaiting clinician sign-off.

export const LOW_BEDS = 2;
export const BEDS_FRESH_HOURS = 24;

export interface Beds {
  total: number;
  free: number;
  updatedAt: string | null; // ISO timestamp
}

export type BedState = 'none' | 'ok' | 'low' | 'stale';

export function bedState(b: Beds | null | undefined, now: Date): BedState {
  if (!b || !(b.total > 0)) return 'none';
  const at = b.updatedAt ? Date.parse(b.updatedAt) : Number.NaN;
  if (!Number.isFinite(at) || now.getTime() - at > BEDS_FRESH_HOURS * 3_600_000) return 'stale';
  return b.free <= LOW_BEDS ? 'low' : 'ok';
}

/** True when the app must not send a new referral to this facility. */
export const bedsBlock = (b: Beds | null | undefined, now: Date) => bedState(b, now) === 'low';

export function parseBeds(r: Record<string, unknown>): Beds | null {
  const total = Number(r.beds_total);
  const free = Number(r.beds_free);
  if (!Number.isInteger(total) || !Number.isInteger(free) || total < 0 || free < 0 || free > total) return null;
  return { total, free, updatedAt: typeof r.beds_updated_at === 'string' ? r.beds_updated_at : null };
}

/** Whole hours since the count was updated, for "updated 3 h ago". */
export function hoursSince(iso: string | null, now: Date): number | null {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(at) ? Math.max(0, Math.floor((now.getTime() - at) / 3_600_000)) : null;
}
