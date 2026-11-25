import { describe, expect, it } from 'vitest';
import { isOpen, minutesSince, newOpenIds, notSeenTooLong, parseRequest, type AmbulanceRequest } from './ambulance';

// FAKE rows shaped like the RPC output.
const row = {
  id: 'a1', referral_id: 'r1', code: 'KAM7QM4X', initials: 'KAM', reason: 'breathing_hard', note: '',
  status: 'requested', eta_minutes: null, answer_note: '', from_name: 'FAKE A', from_phone: '+233000000001',
  to_name: 'FAKE B', to_phone: '+233000000002', created_at: '2026-11-25T10:00:00Z', seen_at: null, answered_at: null,
};

describe('parseRequest', () => {
  it('maps a row', () => {
    expect(parseRequest(row)).toMatchObject({ id: 'a1', reason: 'breathing_hard', status: 'requested', toPhone: '+233000000002' });
  });
  it('drops unknown reasons or statuses', () => {
    expect(parseRequest({ ...row, reason: 'looks_bad' })).toBeNull();
    expect(parseRequest({ ...row, status: 'lost' })).toBeNull();
  });
});

describe('notSeenTooLong (call after 10 minutes, H18)', () => {
  const a = parseRequest(row) as AmbulanceRequest;
  it('only for requests nobody has seen, from 10 minutes', () => {
    expect(notSeenTooLong(a, new Date('2026-11-25T10:09:59Z'))).toBe(false);
    expect(notSeenTooLong(a, new Date('2026-11-25T10:10:00Z'))).toBe(true);
    expect(notSeenTooLong({ ...a, status: 'seen' }, new Date('2026-11-25T11:00:00Z'))).toBe(false);
  });
});

describe('helpers', () => {
  it('isOpen', () => {
    expect(isOpen({ status: 'requested' })).toBe(true);
    expect(isOpen({ status: 'seen' })).toBe(true);
    expect(isOpen({ status: 'dispatched' })).toBe(false);
    expect(isOpen({ status: 'cancelled' })).toBe(false);
  });
  it('minutesSince never negative', () => {
    expect(minutesSince('2026-11-25T10:00:00Z', new Date('2026-11-25T10:12:30Z'))).toBe(12);
    expect(minutesSince('2026-11-25T10:00:00Z', new Date('2026-11-25T09:00:00Z'))).toBe(0);
    expect(minutesSince('bad', new Date())).toBe(0);
  });
  it('newOpenIds finds new unseen requests only', () => {
    const a = parseRequest(row) as AmbulanceRequest;
    const b = { ...a, id: 'a2' };
    const c = { ...a, id: 'a3', status: 'seen' as const };
    expect(newOpenIds(new Set(['a1']), [a, b, c])).toEqual(['a2']);
  });
});
