import { describe, expect, it } from 'vitest';
import { parseStats, share } from './stats';

// FAKE rows shaped like the RPC output; null means the server hid a count from 1 to 4.
const fac = {
  facility_id: 'a', facility_name: 'FAKE A',
  totals: { sent: 12, arrived: 9, tested: null, confirmed: null, not_arrived_7d: 0, received: 6, amb_requests: null, amb_seen_10min: null, amb_dispatched: 0 },
  weeks: [{ week: '2026-11-23', sent: 7, arrived: null, received: 0, amb_requests: null }, { bad: 1 }],
};

describe('parseStats', () => {
  it('keeps hidden counts as null, never as zero', () => {
    const [f] = parseStats([fac, { nope: 1 }]);
    expect(f.totals).toMatchObject({ sent: 12, tested: null, confirmed: null, notArrived7d: 0 });
    expect(f.weeks).toEqual([{ week: '2026-11-23', sent: 7, arrived: null, received: 0, ambRequests: null }]);
    expect(parseStats(null)).toEqual([]);
  });
});

describe('share', () => {
  it('rounds down and never divides by zero', () => {
    expect(share(2, 3)).toEqual({ text: '2 of 3 (66%)', pct: 66 });
    expect(share(0, 0)).toEqual({ text: '', pct: null });
  });
  it('says nothing when a count is hidden', () => {
    expect(share(null, 12).text).toBe('');
    expect(share(9, null).text).toBe('');
  });
});
