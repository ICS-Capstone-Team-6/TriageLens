import { describe, expect, it } from 'vitest';
import { RULES_V1, type Rules } from './rules';
import {
  distanceBand, distanceKm, isOpenAt, matchFacilities, parseDirectory, TOP_N, type Facility,
} from './match';

// FAKE facilities only, at made-up points near Accra. No real directory data.
const rules = RULES_V1 as Rules;
const here = { lat: 5.6, lng: -0.2 };
// Tuesday 24 Nov 2026, 10:00 GMT (Ghana local time).
const now = new Date('2026-11-24T10:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const always = { always: true };
// ~0.111 km per 0.001 degree of latitude.
const north = (km: number) => ({ lat: here.lat + km / 111.2, lng: here.lng });

let n = 0;
function fac(over: Partial<Facility> & { km: number }): Facility {
  const { km, ...rest } = over;
  n += 1;
  return {
    id: `fake-${n}`, name: `FAKE Facility ${n}`, district: '', region: '', ...north(km), phone: '+233000000000',
    openingHours: always, services: [], servicesConfirmedAt: daysAgo(10), ...rest,
  };
}

const tb = [{ condition: 'tb' as const, zone: 'refer_now' as const }];

describe('distance', () => {
  it('haversine is about right for a known pair (Accra to Kumasi, about 200 km)', () => {
    const km = distanceKm({ lat: 5.6037, lng: -0.187 }, { lat: 6.6885, lng: -1.6244 });
    expect(km).toBeGreaterThan(195);
    expect(km).toBeLessThan(205);
  });

  it('is zero to itself and symmetric', () => {
    const a = { lat: 6, lng: -1 };
    const b = { lat: 7, lng: 0 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });

  it.each([[0, 'under_5'], [4.99, 'under_5'], [5, '5_20'], [49.9, '20_50'], [100, '50_100'], [100.1, 'over_100']] as const)(
    '%s km is band %s', (km, band) => expect(distanceBand(km)).toBe(band));
});

describe('isOpenAt (Ghana is GMT all year)', () => {
  const weekdays = { mon: [['08:00', '17:00']], tue: [['08:00', '17:00']] } as const;
  it('always open', () => expect(isOpenAt(always, now)).toBe(true));
  it('inside hours', () => expect(isOpenAt(weekdays as never, now)).toBe(true));
  it('closing time is closed', () => expect(isOpenAt(weekdays as never, new Date('2026-11-24T17:00:00Z'))).toBe(false));
  it('a day not listed is closed', () => expect(isOpenAt(weekdays as never, new Date('2026-11-29T10:00:00Z'))).toBe(false));
  it('unknown hours are unknown, never closed', () => {
    expect(isOpenAt(null, now)).toBeNull();
    expect(isOpenAt({}, now)).toBeNull();
    expect(isOpenAt({ tue: [['late', 'never']] } as never, now)).toBeNull();
  });
});

describe('matchFacilities', () => {
  it('no referral for low risk or retake', () => {
    expect(matchFacilities([{ condition: 'tb', zone: 'low_risk' }], [fac({ km: 1 })], here, now, rules).kind).toBe('no_referral');
    expect(matchFacilities([{ condition: 'tb', zone: 'retake' }], [fac({ km: 1 })], here, now, rules).kind).toBe('no_referral');
  });

  it('asks for a location instead of guessing one', () => {
    const f = [fac({ km: 1, services: ['tb_rapid_test'] })];
    expect(matchFacilities(tb, f, null, now, rules).kind).toBe('no_location');
    expect(matchFacilities(tb, f, { lat: Number.NaN, lng: 0 }, now, rules).kind).toBe('no_location');
  });

  it('keeps only facilities with every needed service and returns at most three', () => {
    const f = [
      fac({ km: 2, services: ['tb_treatment'] }), // missing the rapid test
      fac({ km: 8, services: ['tb_rapid_test'] }),
      fac({ km: 12, services: ['tb_rapid_test'] }),
      fac({ km: 30, services: ['tb_rapid_test'] }),
      fac({ km: 60, services: ['tb_rapid_test'] }),
    ];
    const m = matchFacilities(tb, f, here, now, rules);
    expect(m.kind).toBe('matches');
    if (m.kind !== 'matches') return;
    expect(m.options).toHaveLength(TOP_N);
    expect(m.options.map((o) => Math.round(o.distanceKm))).toEqual([8, 12, 30]);
    expect(m.options.every((o) => o.missing.length === 0)).toBe(true);
    expect(m.urgency).toBe('days');
  });

  it('within the same 5 km step, open now beats closed, then preferred services win', () => {
    const closed = { mon: [['08:00', '09:00']] };
    const f = [
      fac({ name: 'FAKE Closed', km: 10.1, services: ['tb_rapid_test', 'tb_treatment'], openingHours: closed as never }),
      fac({ name: 'FAKE Open plain', km: 10.9, services: ['tb_rapid_test'] }),
      fac({ name: 'FAKE Open preferred', km: 11.5, services: ['tb_rapid_test', 'tb_treatment'] }),
    ];
    const m = matchFacilities(tb, f, here, now, rules);
    if (m.kind !== 'matches') throw new Error(m.kind);
    expect(m.options.map((o) => o.facility.name)).toEqual(['FAKE Open preferred', 'FAKE Open plain', 'FAKE Closed']);
  });

  it('a nearer step always ranks before a farther one, even if closed', () => {
    const closed = { mon: [['08:00', '09:00']] };
    const f = [
      fac({ name: 'FAKE Far open', km: 40, services: ['tb_rapid_test', 'tb_treatment'] }),
      fac({ name: 'FAKE Near closed', km: 3, services: ['tb_rapid_test'], openingHours: closed as never }),
    ];
    const m = matchFacilities(tb, f, here, now, rules);
    if (m.kind !== 'matches') throw new Error(m.kind);
    expect(m.options[0].facility.name).toBe('FAKE Near closed');
  });

  it('flags services not confirmed in 90 days, or never, as stale (H16)', () => {
    const f = [
      fac({ km: 2, services: ['tb_rapid_test'], servicesConfirmedAt: daysAgo(91) }),
      fac({ km: 3, services: ['tb_rapid_test'], servicesConfirmedAt: null }),
      fac({ km: 4, services: ['tb_rapid_test'], servicesConfirmedAt: daysAgo(90) }),
    ];
    const m = matchFacilities(tb, f, here, now, rules);
    if (m.kind !== 'matches') throw new Error(m.kind);
    expect(m.options.map((o) => [o.stale, o.confirmedDaysAgo])).toEqual([[true, 91], [true, null], [false, 90]]);
  });

  it('never suggests the facility the person is already at', () => {
    const own = fac({ km: 0.1, services: ['tb_rapid_test'] });
    const m = matchFacilities(tb, [own, fac({ km: 9, services: ['tb_rapid_test'] })], here, now, rules, own.id);
    if (m.kind !== 'matches') throw new Error(m.kind);
    expect(m.options.map((o) => o.facility.id)).not.toContain(own.id);
  });

  it('says so when nothing in reach has every service, with the nearest partial and beyond-reach options', () => {
    const both = [{ condition: 'tb' as const, zone: 'refer_now' as const }, { condition: 'dr' as const, zone: 'refer_now' as const }];
    const f = [
      fac({ name: 'FAKE TB only', km: 5, services: ['tb_rapid_test'] }),
      fac({ name: 'FAKE Eye only', km: 7, services: ['eye_clinic'] }),
      fac({ name: 'FAKE Both far', km: 150, services: ['tb_rapid_test', 'eye_clinic'] }),
    ];
    const m = matchFacilities(both, f, here, now, rules);
    expect(m.kind).toBe('none_in_reach');
    if (m.kind !== 'none_in_reach') return;
    expect(m.nearestPartial?.facility.name).toBe('FAKE TB only');
    expect(m.nearestPartial?.missing).toEqual(['eye_clinic']);
    expect(m.nearestBeyondReach?.facility.name).toBe('FAKE Both far');
  });

  it('none in reach and nothing anywhere gives empty suggestions, not a made-up one', () => {
    const m = matchFacilities(tb, [fac({ km: 3, services: ['oxygen'] })], here, now, rules);
    expect(m).toMatchObject({ kind: 'none_in_reach', nearestPartial: null, nearestBeyondReach: null });
  });

  it('a referral-zone condition with no rule shows every facility by distance, unfiltered', () => {
    const f = [fac({ km: 20 }), fac({ km: 4 })];
    const m = matchFacilities([{ condition: 'pneumonia', zone: 'refer_now' }], f, here, now, rules);
    expect(m.kind).toBe('unfiltered');
    if (m.kind !== 'unfiltered') return;
    expect(m.reason).toBe('no_rule');
    expect(m.options.map((o) => Math.round(o.distanceKm))).toEqual([4, 20]);
  });

  it('a broken rules file never hides a referral: full list by distance', () => {
    const m = matchFacilities(tb, [fac({ km: 6 }), fac({ km: 2 })], here, now, null);
    expect(m).toMatchObject({ kind: 'unfiltered', reason: 'rules_invalid' });
  });
});

describe('parseDirectory', () => {
  it('maps RPC rows and drops rows without a valid location', () => {
    const rows = [
      { id: 'a', name: 'FAKE A', district: 'D', region: 'R', lat: 5.6, lng: -0.2, phone: '+233000000001',
        opening_hours: { always: true }, services: ['tb_rapid_test', 7], services_confirmed_at: '2026-11-01T00:00:00Z' },
      { id: 'b', name: 'FAKE B', lat: null, lng: null },
      { id: 'c', name: 'FAKE C', lat: 200, lng: 0 },
      'junk',
    ];
    const out = parseDirectory(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', services: ['tb_rapid_test'], openingHours: { always: true } });
    expect(parseDirectory({})).toEqual([]);
  });
});
