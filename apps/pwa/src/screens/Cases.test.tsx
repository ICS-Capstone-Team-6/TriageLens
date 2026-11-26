// @vitest-environment jsdom
// Saved cases (E8-06, H8, TRD 7.2): a case with no result (retake, error, unfinished) never
// shows a zone, in the list or when opened; a finished case shows its zone as colour, icon
// and words; raw scores never appear.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createCase, finishCase, openCaseDb, type CaseResult } from '../lib/caseStore';
import { t, type StringKey } from '../strings';
import { FORBIDDEN, render, type Rendered } from '../test/render';
import { Cases } from './Cases';

const ZONES = ['refer_now', 'unsure', 'low_risk'] as const;
const zoneWords = ZONES.map((z) => t(`zone_${z}` as StringKey));
const result = (zone: CaseResult['zone'], passed = true): CaseResult => ({
  zone, modelVersion: 'm-test', modelSha256: 'ab'.repeat(32), thresholdsVersion: 't-test', preprocessVersion: 'cxr-pre-2',
  quality: {
    version: 'quality-2', passed, reason: passed ? null : 'blurred', width: 1200, height: 1400, mean: 120, std: 50,
    colourfulness: 2, sharpness: passed ? 30 : 2, glare_fraction: 0.01, border_flat: 0.2, interior_std: 40,
  },
});

let r: Rendered | undefined;
afterEach(() => { r?.unmount(); r = undefined; });

async function dbWith(...cases: [status: 'result' | 'retake' | 'error' | null, zone?: CaseResult['zone']][]) {
  const db = await openCaseDb(new IDBFactory());
  const made = [];
  for (const [status, zone] of cases) {
    const c = await createCase(db, '35-44');
    if (status) await finishCase(db, c.id, status, status === 'error' ? null : result(zone ?? 'unsure', status !== 'retake'));
    made.push(c);
  }
  return { db, made };
}

const rowOf = (el: HTMLElement, code: string) =>
  [...el.querySelectorAll('.list .item')].find((b) => b.textContent?.includes(code)) as HTMLButtonElement;

describe('Cases: no zone without a result', () => {
  it.each([
    ['retake', 'status_retake'],
    ['error', 'status_error'],
    [null, 'status_captured'],
  ] as const)('a %s case shows its status, never a zone, in the list', async (status, key) => {
    // A retake still stores the model's zone input as "retake"; even an "unsure" passed in is replaced.
    const { db, made } = await dbWith([status, 'unsure']);
    r = await render(<Cases db={db} onScreen={() => {}} />);
    await r.flush();
    const row = rowOf(r.el, made[0].code);
    expect(row.textContent).toContain(t(key));
    for (const w of zoneWords) expect(row.textContent).not.toContain(w);
    expect(row.querySelector('[class*="case-refer"], [class*="case-unsure"], [class*="case-low"]')).toBeNull();
  });

  it('an opened retake case shows "no result" and the retake reason, with no zone block', async () => {
    const { db, made } = await dbWith(['retake', 'refer_now']);
    r = await render(<Cases db={db} onScreen={() => {}} />);
    await r.flush();
    await r.click(rowOf(r.el, made[0].code));
    expect(r.text()).toContain(t('case_no_result_retake'));
    expect(r.text()).toContain(t('retake_title_blurred'));
    expect(r.el.querySelector('.zone')).toBeNull();
    for (const w of zoneWords) expect(r.text()).not.toContain(w);
    expect(r.text()).toContain(t('reminder'));
  });

  it('an opened error case shows "not checked" and no zone', async () => {
    const { db, made } = await dbWith(['error']);
    r = await render(<Cases db={db} onScreen={() => {}} />);
    await r.flush();
    await r.click(rowOf(r.el, made[0].code));
    expect(r.text()).toContain(t('case_no_result_error'));
    expect(r.el.querySelector('.zone')).toBeNull();
  });
});

describe.each(ZONES)('Cases: a finished %s case', (zone) => {
  it('shows the zone as colour, icon and words in the list and when opened', async () => {
    const { db, made } = await dbWith(['result', zone]);
    r = await render(<Cases db={db} onScreen={() => {}} />);
    await r.flush();
    const row = rowOf(r.el, made[0].code);
    const state = row.querySelector(`.case-state.case-${zone}`);
    expect(state?.textContent).toBe(t(`zone_${zone}` as StringKey));
    expect(state?.querySelector('svg')).not.toBeNull();
    await r.click(row);
    const block = r.el.querySelector(`.zone.zone-${zone}`);
    expect(block?.textContent).toContain(t(`zone_${zone}` as StringKey));
    expect(block?.querySelector('svg')).not.toBeNull();
    expect(r.text()).toContain(t(`message_${zone}` as StringKey));
    expect(r.text()).toContain(t('reminder'));
    expect(r.text()).toContain(t('versions', { model: 'm-test', thresholds: 't-test', preprocess: 'cxr-pre-2' }));
    expect(r.text()).not.toMatch(FORBIDDEN);
  });
});

describe('Cases: empty and unavailable', () => {
  it('invites a first screening when there are no cases', async () => {
    const db = await openCaseDb(new IDBFactory());
    r = await render(<Cases db={db} onScreen={() => {}} />);
    await r.flush();
    expect(r.text()).toContain(t('cases_empty_title'));
    expect(r.text()).toContain(t('cases_start'));
  });

  it('says plainly when the phone cannot store cases', async () => {
    r = await render(<Cases db="unavailable" onScreen={() => {}} />);
    expect(r.el.querySelector('[role="alert"]')?.textContent).toContain(t('cases_unavailable_title'));
  });
});
