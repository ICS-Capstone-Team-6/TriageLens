import { describe, expect, it } from 'vitest';
import { byFacility, parseStats, share, totals } from './stats';

const row = (week: string, fac: string, over: Record<string, number> = {}) => ({
  week, facility_id: fac, facility_name: `FAKE ${fac}`, sent: 0, arrived: 0, tested: 0, confirmed: 0,
  not_arrived_7d: 0, received: 0, amb_requests: 0, amb_seen_10min: 0, amb_dispatched: 0, ...over,
});

describe('parseStats', () => {
  it('maps rows and drops broken ones', () => {
    const out = parseStats([row('2026-11-23', 'a', { sent: 3 }), { week: 1 }, 'junk']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ facilityName: 'FAKE a', sent: 3, notArrived7d: 0 });
    expect(parseStats(null)).toEqual([]);
  });
});

describe('totals and byFacility', () => {
  it('sums weeks per facility', () => {
    const rows = parseStats([row('2026-11-23', 'a', { sent: 3, arrived: 2 }), row('2026-11-16', 'a', { sent: 1, arrived: 1 }), row('2026-11-23', 'b', { received: 4 })]);
    const groups = byFacility(rows);
    expect([...groups.keys()]).toEqual(['a', 'b']);
    expect(totals(groups.get('a')!)).toMatchObject({ sent: 4, arrived: 3 });
    expect(totals(groups.get('b')!).received).toBe(4);
  });
});

describe('share', () => {
  it('rounds down and never divides by zero', () => {
    expect(share(2, 3)).toEqual({ text: '2 of 3 (66%)', pct: 66 });
    expect(share(0, 0)).toEqual({ text: '', pct: null });
    expect(share(4, 4).pct).toBe(100);
  });
});
