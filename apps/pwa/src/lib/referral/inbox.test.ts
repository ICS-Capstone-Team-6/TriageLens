import { describe, expect, it } from 'vitest';
import { nextActions, notArrived, parseDetail, parseSummary } from './inbox';

// FAKE rows shaped like the RPC output. No real data.
const row = {
  id: 'r1', code: 'KAM7QM4X', initials: 'KAM', status: 'seen', outcome: null,
  from_facility: 'fa', from_name: 'FAKE A', to_facility: 'fb', to_name: 'FAKE B',
  conditions: ['tb'], urgency: 'days', created_at: '2026-11-20T10:00:00Z', expires_at: '2027-01-19T10:00:00Z',
};

describe('parseSummary', () => {
  it('maps an RPC row', () => {
    expect(parseSummary(row)).toMatchObject({ id: 'r1', status: 'seen', fromName: 'FAKE A', conditions: ['tb'], outcome: null });
  });
  it('drops rows with an unknown status, and ignores an unknown outcome', () => {
    expect(parseSummary({ ...row, status: 'lost' })).toBeNull();
    expect(parseSummary({ ...row, outcome: 'positive' })?.outcome).toBeNull();
  });
});

describe('parseDetail', () => {
  it('keeps only ticked symptoms, valid results and events', () => {
    const d = parseDetail({
      referral: { ...row, from_phone: '+233000000001', to_phone: '+233000000002' },
      case: { age_band: '35-44', sex: null, symptoms: { night_sweats: true, cough_2_weeks: true, fever: false } },
      inferences: [
        { zone: 'refer_now', model_version: 'm', thresholds_version: 't', created_at: 'x' },
        { zone: 'nonsense' },
      ],
      events: [{ status: 'created', note: '', occurred_at: 'a' }, { status: 'bogus' }],
    });
    expect(d?.symptoms).toEqual(['cough_2_weeks', 'night_sweats']);
    expect(d?.results).toHaveLength(1);
    expect(d?.events).toEqual([{ status: 'created', note: '', at: 'a' }]);
    expect(d?.referral.fromPhone).toBe('+233000000001');
  });
  it('null for nothing found', () => {
    expect(parseDetail(null)).toBeNull();
    expect(parseDetail({ referral: { id: 'x' } })).toBeNull();
  });
});

describe('notArrived (follow-up after 7 days)', () => {
  const now = new Date('2026-11-28T10:00:01Z');
  it('marks sent or seen referrals older than 7 days', () => {
    expect(notArrived({ status: 'seen', createdAt: '2026-11-21T10:00:00Z' }, now)).toBe(true);
    expect(notArrived({ status: 'created', createdAt: '2026-11-21T10:00:00Z' }, now)).toBe(true);
  });
  it('not before 7 days, and never once the person arrived', () => {
    expect(notArrived({ status: 'seen', createdAt: '2026-11-22T10:00:00Z' }, now)).toBe(false);
    expect(notArrived({ status: 'arrived', createdAt: '2026-11-01T10:00:00Z' }, now)).toBe(false);
    expect(notArrived({ status: 'seen', createdAt: 'not a date' }, now)).toBe(false);
  });
});

describe('nextActions (forward only, H15)', () => {
  it.each([
    ['created', ['arrived', 'closed']],
    ['seen', ['arrived', 'closed']],
    ['arrived', ['tested', 'closed']],
    ['tested', ['closed']],
    ['closed', []],
  ] as const)('%s -> %j', (s, out) => expect(nextActions(s)).toEqual(out));
});
