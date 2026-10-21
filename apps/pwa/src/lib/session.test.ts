import { describe, expect, it } from 'vitest';
import { ageAfter, canScreen } from './session';

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
