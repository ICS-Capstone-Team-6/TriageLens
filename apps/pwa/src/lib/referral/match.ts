// Nearest capable facility (ADR-28, E10-06). Pure and offline: no network, no clock
// reads (the caller passes `now`). Tested in match.test.ts.
//
// 1. Keep facilities that have every needed service (from the rules table).
// 2. Rank by distance in 5 km steps; within a step, open now first, then more preferred
//    services, then exact distance, then name (stable order).
// 3. Return the top 3. Nothing is chosen for the worker; the UI asks them to pick.
// 4. If nothing within reach has every needed service, say so and show the nearest
//    facility that has some of them, and the nearest full match beyond reach, if any.
// Straight-line distance is an estimate; the UI must say so (hazard H17).
import { needsFor, type Condition, type ConditionResult, type Rules, type ServiceTag, type Urgency } from './rules';

export interface OpeningHours {
  always?: boolean;
  // Day keys mon..sun, each a list of [open, close] in 24-hour "HH:MM" local time.
  [day: string]: boolean | [string, string][] | undefined;
}

export interface Facility {
  id: string;
  name: string;
  district: string;
  region: string;
  lat: number;
  lng: number;
  phone: string;
  openingHours: OpeningHours | null;
  services: string[];
  servicesConfirmedAt: string | null; // ISO timestamp
}

export interface Point {
  lat: number;
  lng: number;
}

export type DistanceBand = 'under_5' | '5_20' | '20_50' | '50_100' | 'over_100';

export interface Option {
  facility: Facility;
  distanceKm: number;
  distanceBand: DistanceBand;
  has: ServiceTag[]; // needed services it has
  missing: ServiceTag[]; // needed services it lacks
  preferredHas: ServiceTag[];
  openNow: boolean | null; // null = hours unknown
  stale: boolean; // services not confirmed recently, or never: "Check by phone first"
  confirmedDaysAgo: number | null;
}

export type Match =
  | { kind: 'no_referral' }
  | { kind: 'no_location' }
  // Rules file broken or a referral-zone condition has no rule: show every facility by distance.
  | { kind: 'unfiltered'; reason: 'rules_invalid' | 'no_rule'; conditions: Condition[]; options: Option[] }
  | { kind: 'matches'; needs: ServiceTag[]; urgency: Urgency; conditions: Condition[]; options: Option[] }
  | {
      kind: 'none_in_reach';
      needs: ServiceTag[];
      urgency: Urgency;
      conditions: Condition[];
      nearestPartial: Option | null;
      nearestBeyondReach: Option | null;
    };

export const TOP_N = 3;
const STEP_KM = 5;
const DEFAULT_STALE_DAYS = 90; // used only when the rules file is broken
const EARTH_RADIUS_KM = 6371.0088;
const DAY_MS = 86_400_000;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function validPoint(p: Point | null | undefined): p is Point {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
}

// Haversine great-circle distance in kilometres.
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceBand(km: number): DistanceBand {
  if (km < 5) return 'under_5';
  if (km < 20) return '5_20';
  if (km < 50) return '20_50';
  if (km <= 100) return '50_100';
  return 'over_100';
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (s: string): number | null => {
  const m = HHMM.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Ghana keeps GMT all year with no daylight saving, so local time is UTC.
// Unknown or malformed hours give null, never "closed".
export function isOpenAt(hours: OpeningHours | null, now: Date): boolean | null {
  if (!hours || typeof hours !== 'object') return null;
  if (hours.always === true) return true;
  const day = hours[DAYS[now.getUTCDay()]];
  const hasAnyDay = DAYS.some((d) => Array.isArray(hours[d]));
  if (!hasAnyDay) return null;
  if (day === undefined) return false; // other days listed, this one not: closed today
  if (!Array.isArray(day)) return null;
  const t = now.getUTCHours() * 60 + now.getUTCMinutes();
  let valid = false;
  for (const span of day) {
    if (!Array.isArray(span) || span.length !== 2) continue;
    const open = minutes(span[0]);
    const close = minutes(span[1]);
    if (open === null || close === null || close <= open) continue;
    valid = true;
    if (t >= open && t < close) return true;
  }
  return valid || day.length === 0 ? false : null;
}

function optionFor(f: Facility, here: Point, needs: ServiceTag[], prefers: ServiceTag[], staleAfterDays: number, now: Date): Option {
  const km = distanceKm(here, f);
  const services = new Set(f.services);
  const confirmed = f.servicesConfirmedAt ? Date.parse(f.servicesConfirmedAt) : Number.NaN;
  const daysAgo = Number.isFinite(confirmed) ? Math.max(0, Math.floor((now.getTime() - confirmed) / DAY_MS)) : null;
  return {
    facility: f,
    distanceKm: km,
    distanceBand: distanceBand(km),
    has: needs.filter((t) => services.has(t)),
    missing: needs.filter((t) => !services.has(t)),
    preferredHas: prefers.filter((t) => services.has(t)),
    openNow: isOpenAt(f.openingHours, now),
    stale: daysAgo === null || daysAgo > staleAfterDays,
    confirmedDaysAgo: daysAgo,
  };
}

function rank(a: Option, b: Option): number {
  const step = Math.floor(a.distanceKm / STEP_KM) - Math.floor(b.distanceKm / STEP_KM);
  if (step !== 0) return step;
  const open = Number(b.openNow === true) - Number(a.openNow === true);
  if (open !== 0) return open;
  const pref = b.preferredHas.length - a.preferredHas.length;
  if (pref !== 0) return pref;
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  return a.facility.name.localeCompare(b.facility.name);
}

const byDistance = (a: Option, b: Option) => a.distanceKm - b.distanceKm || a.facility.name.localeCompare(b.facility.name);

export function matchFacilities(
  results: ConditionResult[],
  facilities: Facility[],
  here: Point | null,
  now: Date,
  rules: Rules | null,
  fromFacilityId?: string,
): Match {
  const referring = results.some((r) => r.zone === 'refer_now' || r.zone === 'unsure');
  if (!referring) return { kind: 'no_referral' };
  if (!validPoint(here)) return { kind: 'no_location' };
  // Never suggest the facility the person is already at, or one with no valid location.
  const pool = facilities.filter((f) => f.id !== fromFacilityId && validPoint(f));

  if (!rules) {
    const options = pool.map((f) => optionFor(f, here, [], [], DEFAULT_STALE_DAYS, now)).sort(byDistance);
    return { kind: 'unfiltered', reason: 'rules_invalid', conditions: [], options };
  }
  const need = needsFor(results, rules);
  if (need.kind === 'no_referral') return { kind: 'no_referral' };
  if (need.kind === 'no_rule') {
    const options = pool.map((f) => optionFor(f, here, [], [], rules.staleAfterDays, now)).sort(byDistance);
    return { kind: 'unfiltered', reason: 'no_rule', conditions: need.conditions, options };
  }

  const all = pool.map((f) => optionFor(f, here, need.needs, need.prefers, rules.staleAfterDays, now));
  const full = all.filter((o) => o.missing.length === 0);
  const inReach = full.filter((o) => o.distanceKm <= rules.maxDistanceKm).sort(rank);
  const base = { needs: need.needs, urgency: need.urgency, conditions: need.conditions };
  if (inReach.length > 0) return { kind: 'matches', ...base, options: inReach.slice(0, TOP_N) };

  const partial = all
    .filter((o) => o.has.length > 0 && o.missing.length > 0 && o.distanceKm <= rules.maxDistanceKm)
    .sort((a, b) => b.has.length - a.has.length || byDistance(a, b));
  const beyond = full.sort(byDistance);
  return { kind: 'none_in_reach', ...base, nearestPartial: partial[0] ?? null, nearestBeyondReach: beyond[0] ?? null };
}

// Directory rows from list_referral_facilities() (snake_case JSON) to Facility.
// Rows with a bad shape are dropped rather than guessed.
export function parseDirectory(rows: unknown): Facility[] {
  if (!Array.isArray(rows)) return [];
  const out: Facility[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r.id !== 'string' || typeof r.name !== 'string') continue;
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (r.lat === null || r.lng === null || !validPoint({ lat, lng })) continue;
    out.push({
      id: r.id,
      name: r.name,
      district: typeof r.district === 'string' ? r.district : '',
      region: typeof r.region === 'string' ? r.region : '',
      lat,
      lng,
      phone: typeof r.phone === 'string' ? r.phone : '',
      openingHours: r.opening_hours && typeof r.opening_hours === 'object' ? (r.opening_hours as OpeningHours) : null,
      services: Array.isArray(r.services) ? r.services.filter((s): s is string => typeof s === 'string') : [],
      servicesConfirmedAt: typeof r.services_confirmed_at === 'string' ? r.services_confirmed_at : null,
    });
  }
  return out;
}
