// @vitest-environment jsdom
// Result screen per zone (E8-05, TRD 7.2-7.3, hazards H1, H2, H8): exact wording, colour plus
// icon plus words, the reminder and versions on every result, the right next actions, and no
// raw score or forbidden word on a real screen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t, type StringKey } from '../strings';
import { FORBIDDEN, render, type Rendered } from '../test/render';
import { Result, Retake } from './Flow';

const versions = { model: 'cxr-tb-test', thresholds: 'thr-test', preprocess: 'cxr-pre-2' };
const ZONES = ['refer_now', 'unsure', 'low_risk'] as const;
let r: Rendered | undefined;
afterEach(() => { r?.unmount(); r = undefined; });

const buttons = (el: HTMLElement) => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());

describe.each(ZONES)('Result: %s', (zone) => {
  it('shows the zone as colour, icon and words with the exact message', async () => {
    r = await render(<Result zone={zone} versions={versions} saved={null} onDone={() => {}} onRetake={() => {}} />);
    const band = r.el.querySelector(`.zone-band.zone-${zone}`);
    expect(band, 'zone colour block').not.toBeNull();
    const name = band!.querySelector('#zone-name');
    expect(name?.textContent).toBe(t(`zone_${zone}` as StringKey));
    expect(name?.querySelector('svg'), 'zone icon').not.toBeNull();
    expect(band!.querySelector('.zone-msg')?.textContent).toBe(t(`message_${zone}` as StringKey));
    // Only this zone's colour appears; no other zone leaks onto the screen.
    for (const other of ZONES.filter((z) => z !== zone)) expect(r.el.querySelector(`.zone-${other}`)).toBeNull();
  });

  it('carries the reminder, the three versions and no forbidden word or raw score', async () => {
    r = await render(<Result zone={zone} ageBand="35-44" caseCode="TL-7K3MPQ" versions={versions} saved onDone={() => {}} onRetake={() => {}} />);
    const text = r.text();
    expect(text).toContain(t('reminder'));
    expect(text).toContain(t('versions', versions));
    expect(text).toContain('TL-7K3MPQ');
    expect(text).toContain('35-44');
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(/\d\.\d{3}/); // no probability on a real result (TRD 7.3)
  });

  it('warns when the phone could not save the case', async () => {
    r = await render(<Result zone={zone} caseCode={null} versions={versions} saved={null} onDone={() => {}} onRetake={() => {}} />);
    expect(r.text()).toContain(t('result_case_failed'));
  });
});

describe('Result actions per zone', () => {
  it('Not sure offers retake and refer, never only "next person" (uncertainty moves toward refer or retake)', async () => {
    const onRetake = vi.fn();
    r = await render(<Result zone="unsure" versions={versions} saved={null} onDone={() => {}} onRetake={onRetake} onRefer={() => {}} />);
    expect(buttons(r.el)).toEqual([t('retake'), t('refer')]);
    await r.click([...r.el.querySelectorAll('button')].find((b) => b.textContent === t('retake'))!);
    expect(onRetake).toHaveBeenCalledOnce();
  });

  it('Refer now puts refer first, and it waits while the case is saving', async () => {
    const onRefer = vi.fn();
    r = await render(<Result zone="refer_now" versions={versions} saved={null} onDone={() => {}} onRetake={() => {}} onRefer={onRefer} referBusy />);
    const first = r.el.querySelector('.foot button') as HTMLButtonElement;
    expect(first.textContent).toBe(t('refer_saving'));
    expect(first.disabled).toBe(true);
  });

  it('Low risk keeps the "does not rule out disease" advice and moves to the next person', async () => {
    r = await render(<Result zone="low_risk" versions={versions} saved={null} onDone={() => {}} onRetake={() => {}} />);
    expect(r.text()).toContain('This does not rule out disease');
    expect(r.text()).toContain(t('action_low_risk'));
    expect(buttons(r.el)).toEqual([t('next_person')]);
  });

  it('shows the raw score only when a development build passes it', async () => {
    r = await render(<Result zone="unsure" versions={versions} saved={null} onDone={() => {}} onRetake={() => {}}
      devScore={{ probability: 0.4321, screenOut: 0.1, refer: 0.8 }} />);
    expect(r.text()).toContain('0.432');
  });
});

describe('Retake', () => {
  it('shows the reason, says there is no result, and shows no zone', async () => {
    r = await render(<Retake reason="blurred" onRetake={() => {}} onCancel={() => {}} />);
    expect(r.text()).toContain(t('retake_title_blurred'));
    expect(r.text()).toContain(t('retake_no_result'));
    expect(r.el.querySelector('[class*="zone-"]')).toBeNull();
    for (const z of ZONES) expect(r.text()).not.toContain(t(`zone_${z}` as StringKey));
  });
});
