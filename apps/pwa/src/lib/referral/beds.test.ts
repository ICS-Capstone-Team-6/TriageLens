import { describe, expect, it } from 'vitest';
import { bedState, bedsBlock, hoursSince, parseBeds } from './beds';

const now = new Date('2026-11-26T12:00:00Z');
const hAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe('bedState', () => {
  it('treats no beds listed as outpatient only, never blocked', () => {
    expect(bedState({ total: 0, free: 0, updatedAt: hAgo(1) }, now)).toBe('none');
    expect(bedState(null, now)).toBe('none');
    expect(bedsBlock({ total: 0, free: 0, updatedAt: hAgo(1) }, now)).toBe(false);
  });
  it('blocks a fresh count at or below two free beds', () => {
    expect(bedState({ total: 30, free: 2, updatedAt: hAgo(1) }, now)).toBe('low');
    expect(bedState({ total: 30, free: 0, updatedAt: hAgo(23) }, now)).toBe('low');
    expect(bedsBlock({ total: 30, free: 2, updatedAt: hAgo(1) }, now)).toBe(true);
  });
  it('allows three or more free beds', () => {
    expect(bedState({ total: 30, free: 3, updatedAt: hAgo(1) }, now)).toBe('ok');
  });
  it('never blocks on an old or missing date; it asks the worker to call first', () => {
    expect(bedState({ total: 30, free: 0, updatedAt: hAgo(25) }, now)).toBe('stale');
    expect(bedState({ total: 30, free: 0, updatedAt: null }, now)).toBe('stale');
    expect(bedsBlock({ total: 30, free: 0, updatedAt: hAgo(25) }, now)).toBe(false);
  });
});

describe('parseBeds', () => {
  it('reads the directory row', () => {
    expect(parseBeds({ beds_total: 30, beds_free: 4, beds_updated_at: '2026-11-26T10:00:00Z' })).toEqual({ total: 30, free: 4, updatedAt: '2026-11-26T10:00:00Z' });
  });
  it('rejects impossible counts', () => {
    expect(parseBeds({ beds_total: 3, beds_free: 4 })).toBeNull();
    expect(parseBeds({ beds_total: -1, beds_free: 0 })).toBeNull();
    expect(parseBeds({ beds_total: 'x', beds_free: 0 })).toBeNull();
    expect(parseBeds({})).toBeNull();
  });
});

describe('hoursSince', () => {
  it('counts whole hours', () => {
    expect(hoursSince(hAgo(3.5), now)).toBe(3);
    expect(hoursSince(null, now)).toBeNull();
  });
});
