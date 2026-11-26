import { describe, expect, it, vi } from 'vitest';
import { estimateRoute, loadRoute, parseRoute, trafficAt } from './route';

const at = (iso: string) => new Date(iso);
const brekusu = { lat: 5.7834, lng: -0.2089 };
const korleBu = { lat: 5.53808, lng: -0.2272 };
const body = { code: 'Ok', routes: [{ distance: 30000, duration: 1500, geometry: { coordinates: [[-0.2089, 5.7834], [-0.22, 5.6], [-0.2272, 5.53808]] } }] };

describe('trafficAt (usual traffic in Accra, simulated)', () => {
  it('is heavy at the weekday rush hours', () => {
    expect(trafficAt(at('2026-11-26T07:30:00Z')).level).toBe('heavy'); // Thursday
    expect(trafficAt(at('2026-11-26T17:00:00Z')).level).toBe('heavy');
  });
  it('is moderate in the daytime and light at night and early morning', () => {
    expect(trafficAt(at('2026-11-26T12:00:00Z')).level).toBe('moderate');
    expect(trafficAt(at('2026-11-26T02:00:00Z')).level).toBe('light');
  });
  it('is lighter on a weekend morning rush', () => {
    expect(trafficAt(at('2026-11-28T07:30:00Z')).level).toBe('light'); // Saturday
  });
});

describe('parseRoute', () => {
  it('reads km, time with traffic, and the road geometry', () => {
    const r = parseRoute(body, at('2026-11-26T02:00:00Z'))!; // light: factor 1
    expect(r.km).toBeCloseTo(30, 5);
    expect(r.minutes).toBeCloseTo(25, 5);
    expect(r.source).toBe('road');
    expect(r.path).toHaveLength(3);
    expect(r.path![0]).toEqual({ lat: 5.7834, lng: -0.2089 });
  });
  it('takes longer in the rush hour than at night over the same road', () => {
    expect(parseRoute(body, at('2026-11-26T07:30:00Z'))!.minutes).toBeGreaterThan(parseRoute(body, at('2026-11-26T02:00:00Z'))!.minutes * 1.5);
  });
  it('rejects answers that are not a usable route', () => {
    for (const bad of [null, {}, { code: 'NoRoute' }, { code: 'Ok', routes: [] }, { code: 'Ok', routes: [{ distance: 0, duration: 5, geometry: { coordinates: [[0, 0], [1, 1]] } }] },
      { code: 'Ok', routes: [{ distance: 5, duration: 5, geometry: { coordinates: [[0, 0]] } }] }, { code: 'Ok', routes: [{ distance: 5, duration: 5, geometry: { coordinates: [['x', 1], [1, 1]] } }] }]) {
      expect(parseRoute(bad, at('2026-11-26T12:00:00Z'))).toBeNull();
    }
  });
});

describe('loadRoute', () => {
  const now = at('2026-11-26T12:00:00Z');
  it('asks OSRM with longitude first and returns the road route', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
    const r = await loadRoute(brekusu, korleBu, now, f as unknown as typeof fetch);
    expect(r.source).toBe('road');
    expect(f.mock.calls[0][0]).toContain('/-0.2089,5.7834;-0.2272,5.53808?overview=full&geometries=geojson');
  });
  it('sends nothing but the two coordinates', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
    await loadRoute({ lat: 1.1111, lng: 2.2222 }, { lat: 3.3333, lng: 4.4444 }, now, f as unknown as typeof fetch);
    expect(String(f.mock.calls[0][0]).replace(/^https:\/\/[^/]+\/route\/v1\/driving\//, '')).toBe('2.2222,1.1111;4.4444,3.3333?overview=full&geometries=geojson');
    expect(f.mock.calls[0][1]).not.toHaveProperty('headers');
  });
  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a server error', () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })],
    ['a bad answer', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 'NoRoute' }) })],
  ])('falls back to a marked estimate when %s', async (_n, impl) => {
    const r = await loadRoute({ lat: 5.1, lng: -0.1 }, { lat: 5.2, lng: -0.1 }, now, vi.fn(impl) as unknown as typeof fetch);
    expect(r.source).toBe('estimate');
    expect(r.path).toBeNull();
    expect(r.km).toBeGreaterThan(0);
  });
  it('re-applies traffic for the hour when a cached road is reused', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
    const a = { lat: 6.0001, lng: -0.3 }, b = { lat: 6.2001, lng: -0.3 };
    const night = await loadRoute(a, b, at('2026-11-26T02:00:00Z'), f as unknown as typeof fetch);
    const rush = await loadRoute(a, b, at('2026-11-26T07:30:00Z'), f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledOnce();
    expect(rush.minutes).toBeGreaterThan(night.minutes);
  });
});

describe('estimateRoute', () => {
  it('is longer than the straight line and slower in the rush', () => {
    const quiet = estimateRoute(brekusu, korleBu, at('2026-11-26T02:00:00Z'));
    expect(quiet.km).toBeGreaterThan(27);
    expect(estimateRoute(brekusu, korleBu, at('2026-11-26T07:30:00Z')).minutes).toBeGreaterThan(quiet.minutes);
  });
});
