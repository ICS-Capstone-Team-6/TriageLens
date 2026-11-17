import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseThresholds } from './config';

const RUN = 'efficientnet_lite0_seed1_20261021T114608Z';
const base = {
  version: 'v0-uncalibrated', status: 'set', run_id: RUN, split: 'shenzhen_v2/validation',
  rule: { screen_out: 'sensitivity >= 0.95', refer: 'specificity >= 0.95' },
  screen_out_probability: 0.1, refer_probability: 0.6, model_sha256: 'ABC123',
};

describe('parseThresholds', () => {
  it('accepts a complete file for the frozen run', () => {
    const s = parseThresholds(base, RUN);
    expect(s.ok).toBe(true);
  });

  it('pending file gives no thresholds', () => {
    expect(parseThresholds({ ...base, status: 'pending', screen_out_probability: null }, RUN)).toEqual({ ok: false, reason: 'pending' });
  });

  it('a file for another run is rejected', () => {
    expect(parseThresholds({ ...base, run_id: 'other' }, RUN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a file without the model hash is still pending', () => {
    expect(parseThresholds({ ...base, model_sha256: null }, RUN)).toEqual({ ok: false, reason: 'pending' });
  });

  it('returns the model hash in lower case for comparison', () => {
    const s = parseThresholds(base, RUN);
    expect(s.ok && s.modelSha256).toBe('abc123');
  });

  it('crossed thresholds are rejected', () => {
    expect(parseThresholds({ ...base, screen_out_probability: 0.7, refer_probability: 0.3 }, RUN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('the shipped file is for the frozen run', () => {
    const shipped = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'config', 'thresholds.json'), 'utf8'));
    expect(shipped.run_id).toBe(RUN);
    expect(shipped.version).toBe('v0-uncalibrated');
  });
});
