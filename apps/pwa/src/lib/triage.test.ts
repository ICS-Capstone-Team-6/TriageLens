import { describe, expect, it } from 'vitest';
import { sigmoid, validThresholds, zoneFor, type Thresholds } from './triage';

// Test thresholds only. Real values come from public/config/thresholds.json (ADR-20).
const t: Thresholds = { version: 'test', screenOut: 0.2, refer: 0.7 };

describe('zoneFor (TRD 7.2)', () => {
  it('failed quality check gives retake, whatever the score', () => {
    expect(zoneFor(0.01, t, false)).toBe('retake');
    expect(zoneFor(0.99, t, false)).toBe('retake');
  });

  it('at or above the refer threshold is refer_now', () => {
    expect(zoneFor(0.7, t, true)).toBe('refer_now');
    expect(zoneFor(0.95, t, true)).toBe('refer_now');
  });

  it('strictly below the screen-out threshold is low_risk', () => {
    expect(zoneFor(0.19, t, true)).toBe('low_risk');
  });

  it('a tie at the screen-out threshold goes to unsure, never toward reassurance', () => {
    expect(zoneFor(0.2, t, true)).toBe('unsure');
  });

  it('between the thresholds is unsure', () => {
    expect(zoneFor(0.5, t, true)).toBe('unsure');
  });

  it('invalid scores never give low_risk', () => {
    for (const p of [Number.NaN, -0.1, 1.1, Number.POSITIVE_INFINITY]) expect(zoneFor(p, t, true)).toBe('unsure');
  });

  it('invalid or crossed thresholds never give low_risk', () => {
    expect(zoneFor(0.01, { version: 'x', screenOut: 0.8, refer: 0.3 }, true)).toBe('unsure');
    expect(zoneFor(0.01, { version: 'x', screenOut: Number.NaN, refer: 0.3 }, true)).toBe('unsure');
  });

  it('low_risk is reachable only from a valid score below a valid screen-out', () => {
    for (let p = 0; p <= 1; p += 0.01) {
      if (zoneFor(p, t, true) === 'low_risk') expect(p).toBeLessThan(t.screenOut);
    }
  });
});

describe('helpers', () => {
  it('sigmoid matches the logistic function', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 12);
    expect(sigmoid(Math.log(0.184 / 0.816))).toBeCloseTo(0.184, 12);
  });

  it('validThresholds requires 0 < screenOut <= refer < 1', () => {
    expect(validThresholds({ screenOut: 0.2, refer: 0.7 })).toBe(true);
    expect(validThresholds({ screenOut: 0.7, refer: 0.2 })).toBe(false);
    expect(validThresholds({ screenOut: 0, refer: 0.7 })).toBe(false);
  });
});
