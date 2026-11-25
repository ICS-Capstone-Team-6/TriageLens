import { describe, expect, it } from 'vitest';
import { formatCode, isBedsRefusal, parseSent, readCache, referralPayload, toInitials } from './api';

describe('toInitials (made-up names only)', () => {
  it.each([
    ['Kofi Ama Mensah', 'KAM'],
    ['kofi ama mensah', 'KAM'],
    ['KAM', 'KAM'],
    ['K.A.M', 'KAM'],
    ['Akua Serwaa-Boateng', 'ASB'],
    ['Ɔsɛi Ɛfua', 'OE'],
    ['Éfua Ŋɔɔ', 'EN'],
    ['Ama Kofi Yaw Esi Adwoa', 'AKYE'], // at most 4
    ['  ', ''],
    ['123 !!', ''],
  ])('%s -> %s', (input, out) => expect(toInitials(input)).toBe(out));

  it('a single name gives one letter, never the whole name', () => {
    expect(toInitials('Kofi')).toBe('K');
    expect(toInitials('Ama')).toBe('A');
  });
});

describe('referralPayload', () => {
  it('maps the draft to the RPC fields only', () => {
    expect(referralPayload({
      id: 'r1', caseId: 'c1', toFacility: 'f2', conditions: ['tb'], urgency: 'days',
      rulesVersion: 'referral-rules-v1', distanceBand: '20_50', initials: 'KAM',
    })).toEqual({
      id: 'r1', case_id: 'c1', to_facility: 'f2', conditions: ['tb'], urgency: 'days',
      rules_version: 'referral-rules-v1', distance_band: '20_50', initials: 'KAM',
    });
  });
});

describe('parseSent and formatCode', () => {
  it('accepts initials then random characters', () => {
    expect(parseSent({ id: 'r', code: 'KAM7QM4X', initials: 'KAM', expires_at: '2027-01-24T00:00:00Z' }))
      .toEqual({ id: 'r', code: 'KAM7QM4X', initials: 'KAM', expiresAt: '2027-01-24T00:00:00Z' });
    expect(formatCode('KAM7QM4X', 'KAM')).toBe('KAM 7QM4X');
  });

  it('a code with no initials reads as two groups of four', () => {
    expect(parseSent({ id: 'r', code: 'ABCD2345', initials: '' })?.code).toBe('ABCD2345');
    expect(formatCode('ABCD2345')).toBe('ABCD 2345');
  });

  it.each([
    ['wrong length', { id: 'r', code: 'KAM7QM4', initials: 'KAM' }],
    ['code not starting with initials', { id: 'r', code: 'XYZ7QM4X', initials: 'KAM' }],
    ['look-alike in random part', { id: 'r', code: 'KAM7QM0X', initials: 'KAM' }],
    ['no id', { code: 'ABCD2345' }],
  ])('rejects %s', (_l, row) => expect(parseSent(row)).toBeNull());
});

describe('readCache', () => {
  it('round-trips a cached directory', () => {
    const facilities = [{
      id: 'a', name: 'FAKE A', district: 'D', region: 'R', lat: 5.6, lng: -0.2, phone: '+233000000001',
      openingHours: { always: true }, services: ['tb_rapid_test'], servicesConfirmedAt: '2026-11-01T00:00:00Z',
    }];
    const c = readCache(JSON.stringify({ savedAt: '2026-11-25T10:00:00Z', facilities }));
    expect(c).toEqual({ savedAt: '2026-11-25T10:00:00Z', facilities });
  });

  it.each([[null], ['not json'], ['{}'], ['{"savedAt":1,"facilities":[]}']])('returns null for %s', (raw) => {
    expect(readCache(raw)).toBeNull();
  });
});

describe('isBedsRefusal', () => {
  it('recognises the server bed block, and nothing else', () => {
    expect(isBedsRefusal('This facility has too few free beds. Call them, or choose another facility.')).toBe(true);
    expect(isBedsRefusal('Bad referral field')).toBe(false);
    expect(isBedsRefusal(undefined)).toBe(false);
  });
});
