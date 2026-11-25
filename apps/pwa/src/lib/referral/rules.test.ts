import { describe, expect, it } from 'vitest';
import rulesFile from './rules.v1.json';
import { RULES_V1, SERVICE_TAGS, needsFor, parseRules, type Rules } from './rules';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clone = () => JSON.parse(JSON.stringify(rulesFile)) as Record<string, unknown> & { rules: Record<string, unknown>[] };
const rules = RULES_V1 as Rules;

describe('rules.v1.json (ADR-28)', () => {
  it('parses and stays a demo draft until a clinician signs it off', () => {
    expect(RULES_V1).not.toBeNull();
    expect(rules.status).toBe('demo_draft');
    expect(rules.signedOffBy).toBeNull();
  });

  it('keeps pneumonia off until a pneumonia output exists (ADR-14)', () => {
    expect(rules.rules.find((r) => r.condition === 'pneumonia')?.enabled).toBe(false);
  });

  it('service tags match the database check constraint', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../../supabase/migrations/20261125120000_e10_06_facility_directory.sql'), 'utf8');
    const m = /services <@ array\[([^\]]+)\]::text\[\]/.exec(sql);
    expect(m).not.toBeNull();
    const dbTags = [...(m as RegExpExecArray)[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(dbTags.sort()).toEqual([...SERVICE_TAGS].sort());
  });
});

describe('parseRules', () => {
  it.each([
    ['not an object', null],
    ['no version', { ...clone(), version: '' }],
    ['unknown status', { ...clone(), status: 'final' }],
    ['signed off with no name', { ...clone(), status: 'signed_off', signed_off_on: '2026-12-01' }],
    ['bad stale days', { ...clone(), stale_after_days: 0 }],
    ['bad max distance', { ...clone(), max_distance_km: 'far' }],
  ])('rejects a file with %s', (_label, file) => {
    expect(parseRules(file)).toBeNull();
  });

  it('rejects an unknown service tag', () => {
    const f = clone();
    f.rules[0].needs = ['mri'];
    expect(parseRules(f)).toBeNull();
  });

  it('rejects a rule with no needed service', () => {
    const f = clone();
    f.rules[0].needs = [];
    expect(parseRules(f)).toBeNull();
  });

  it('rejects a rule for low risk or retake (those never refer)', () => {
    const f = clone();
    f.rules[0].zones = ['low_risk'];
    expect(parseRules(f)).toBeNull();
  });

  it('rejects two rules for the same condition and zone', () => {
    const f = clone();
    f.rules.push({ ...f.rules[0] });
    expect(parseRules(f)).toBeNull();
  });

  it('accepts a signed-off file that names who and when', () => {
    const f = { ...clone(), status: 'signed_off', signed_off_by: 'Test reviewer', signed_off_on: '2026-12-01' };
    expect(parseRules(f)?.status).toBe('signed_off');
  });
});

describe('needsFor', () => {
  it('low risk and retake create no referral', () => {
    expect(needsFor([{ condition: 'tb', zone: 'low_risk' }, { condition: 'dr', zone: 'retake' }], rules))
      .toEqual({ kind: 'no_referral' });
  });

  it('TB refer now needs a rapid TB test and prefers treatment', () => {
    expect(needsFor([{ condition: 'tb', zone: 'refer_now' }], rules)).toEqual({
      kind: 'needs', needs: ['tb_rapid_test'], prefers: ['tb_treatment'], urgency: 'days', conditions: ['tb'],
    });
  });

  it('TB unsure is treated like refer now (toward refer, TRD 7.2)', () => {
    expect(needsFor([{ condition: 'tb', zone: 'unsure' }], rules))
      .toEqual(needsFor([{ condition: 'tb', zone: 'refer_now' }], rules));
  });

  it('TB and DR together need both services and take the more urgent timeframe', () => {
    const n = needsFor([{ condition: 'tb', zone: 'refer_now' }, { condition: 'dr', zone: 'unsure' }], rules);
    expect(n).toMatchObject({ kind: 'needs', needs: ['eye_clinic', 'tb_rapid_test'], urgency: 'days', conditions: ['tb', 'dr'] });
  });

  it('a referral-zone condition with no enabled rule is never dropped silently', () => {
    expect(needsFor([{ condition: 'pneumonia', zone: 'refer_now' }], rules)).toEqual({ kind: 'no_rule', conditions: ['pneumonia'] });
    expect(needsFor([{ condition: 'tb', zone: 'refer_now' }, { condition: 'pneumonia', zone: 'unsure' }], rules))
      .toEqual({ kind: 'no_rule', conditions: ['pneumonia'] });
  });

  it('a service that is needed is not also listed as preferred', () => {
    const f = clone();
    f.rules[2].prefers = ['tb_rapid_test', 'retina_laser'];
    const r = parseRules(f) as Rules;
    const n = needsFor([{ condition: 'tb', zone: 'refer_now' }, { condition: 'dr', zone: 'refer_now' }], r);
    expect(n).toMatchObject({ prefers: ['retina_laser', 'tb_treatment'] });
  });
});
