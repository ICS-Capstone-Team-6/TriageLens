import { describe, expect, it } from 'vitest';
import { ageAfter, backendRequired, canScreen, modelMatches } from './session';

describe('age band is per person (H5)', () => {
  it('is cleared when a screening ends', () => {
    for (const a of ['done', 'cancel', 'error'] as const) expect(ageAfter(a, '25-34')).toBeNull();
  });

  it('is kept only for a retake of the same person', () => {
    expect(ageAfter('retake', '25-34')).toBe('25-34');
  });
});

describe('canScreen', () => {
  it('never starts for under 15 or without an age', () => {
    expect(canScreen(true, true, 'under15')).toBe(false);
    expect(canScreen(true, true, null)).toBe(false);
  });

  it('needs the model and valid thresholds', () => {
    expect(canScreen(false, true, '25-34')).toBe(false);
    expect(canScreen(true, false, '25-34')).toBe(false);
    expect(canScreen(true, true, '25-34')).toBe(true);
  });
});

describe('modelMatches (H7)', () => {
  const sha = 'a'.repeat(64);
  it('accepts the same hash in any case', () => {
    expect(modelMatches(sha, sha.toUpperCase())).toBe(true);
  });
  it('rejects a different or malformed hash', () => {
    expect(modelMatches(sha, 'b'.repeat(64))).toBe(false);
    expect(modelMatches('', '')).toBe(false);
  });
});

describe('backendRequired (H3)', () => {
  it('a production build without the backend must not run', () => {
    expect(backendRequired(true, false)).toBe(true);
    expect(backendRequired(true, true)).toBe(false);
    expect(backendRequired(false, false)).toBe(false);
  });
});
