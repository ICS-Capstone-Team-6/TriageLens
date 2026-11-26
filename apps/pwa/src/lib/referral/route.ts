// Drive route and arrival time from your clinic to a facility, for the Map (H17: guidance only).
//  * Road route, distance and time come from OSRM (open source routing on OpenStreetMap data).
//    Only the two facilities' coordinates are sent: no patient data, no case, no name.
//  * There is no live traffic here. Free map data does not include it. The time is the free-flow
//    road time multiplied by a usual-traffic factor for the hour in Accra (simulated, labelled
//    as an estimate on screen).
//  * Offline, slow or blocked: a rough estimate from the straight-line distance, marked as such.
//    The route never throws and never blocks a referral.
import { distanceKm, type Point } from './match';

export type Traffic = 'light' | 'moderate' | 'heavy';

export interface RouteInfo {
  km: number;
  /** Driving time with the usual traffic for this hour. */
  minutes: number;
  traffic: Traffic;
  /** Road geometry, or null for a rough estimate. */
  path: Point[] | null;
  source: 'road' | 'estimate';
}

const ROUTE_URL = (import.meta.env.VITE_ROUTE_URL as string | undefined) ?? 'https://router.project-osrm.org/route/v1/driving';
const TIMEOUT_MS = 7000;
const MAX_POINTS = 200;
const DETOUR = 1.35; // roads are longer than the straight line
const FREE_FLOW_KMH = 40; // district roads, for the offline estimate

/** Usual traffic at this hour in Accra (Ghana is on UTC all year). Simulated, not live. */
export function trafficAt(now: Date): { level: Traffic; factor: number } {
  const h = now.getUTCHours();
  const weekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  if (weekday && ((h >= 6 && h < 9) || (h >= 16 && h < 19))) return { level: 'heavy', factor: 1.7 };
  if (weekday && h >= 9 && h < 16) return { level: 'moderate', factor: 1.25 };
  if (h >= 19 && h < 22) return { level: 'moderate', factor: 1.2 };
  if (!weekday && h >= 9 && h < 19) return { level: 'moderate', factor: 1.15 };
  return { level: 'light', factor: 1 };
}

export function estimateRoute(a: Point, b: Point, now: Date): RouteInfo {
  const km = distanceKm(a, b) * DETOUR;
  const { level, factor } = trafficAt(now);
  return { km, minutes: (km / FREE_FLOW_KMH) * 60 * factor, traffic: level, path: null, source: 'estimate' };
}

function thin<T>(xs: T[]): T[] {
  if (xs.length <= MAX_POINTS) return xs;
  const step = (xs.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => xs[Math.round(i * step)]);
}

interface Road { km: number; baseMinutes: number; path: Point[] }

const withTraffic = (r: Road, now: Date): RouteInfo => {
  const { level, factor } = trafficAt(now);
  return { km: r.km, minutes: r.baseMinutes * factor, traffic: level, path: r.path, source: 'road' };
};

/** Pure: reads an OSRM answer into a road (free-flow time, no traffic yet), or null if unusable. */
export function parseRoad(body: unknown): Road | null {
  const r = body as { code?: string; routes?: { distance?: number; duration?: number; geometry?: { coordinates?: unknown } }[] } | null;
  const route = r?.code === 'Ok' ? r.routes?.[0] : undefined;
  if (!route || !(route.distance! > 0) || !(route.duration! > 0)) return null;
  const coords = route.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const path: Point[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
    path.push({ lat: c[1], lng: c[0] });
  }
  return { km: route.distance! / 1000, baseMinutes: route.duration! / 60, path: thin(path) };
}

export const parseRoute = (body: unknown, now: Date): RouteInfo | null => {
  const road = parseRoad(body);
  return road ? withTraffic(road, now) : null;
};

const cache = new Map<string, Road>();

export async function loadRoute(a: Point, b: Point, now: Date, fetchFn: typeof fetch = fetch): Promise<RouteInfo> {
  const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return withTraffic(hit, now); // the road is kept; traffic is for the hour it is asked
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`${ROUTE_URL}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: ctl.signal });
    const road = res.ok ? parseRoad(await res.json()) : null;
    if (road) { cache.set(key, road); return withTraffic(road, now); }
  } catch {
    // offline, blocked or too slow: fall through to the estimate
  } finally {
    clearTimeout(timer);
  }
  return estimateRoute(a, b, now);
}
