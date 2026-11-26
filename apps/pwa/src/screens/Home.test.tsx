// @vitest-environment jsdom
// Under-15 gate on the camera screen (H5, TRD 3.2: not for children's X-rays).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgeBand } from '../lib/records';
import { canScreen } from '../lib/session';
import { t } from '../strings';
import { render, type Rendered } from '../test/render';
import { Home } from './Home';

let r: Rendered | undefined;
afterEach(() => { r?.unmount(); r = undefined; });

const home = (age: AgeBand | 'under15' | null, ready: boolean, onAge = vi.fn()) => (
  <Home age={age} onAge={onAge} onFile={() => {}} ready={ready} modelReady onMonitor={() => {}} onSignOut={null} backendNote={false} tabs={[]} />
);
const shutter = (el: HTMLElement) => el.querySelector(`button[aria-label="${t('take_photo')}"]`) as HTMLButtonElement;
const upload = (el: HTMLElement) => el.querySelector(`button[aria-label="${t('upload')}"]`) as HTMLButtonElement;

describe('Home: under-15 gate (H5)', () => {
  it('turns the shutter and upload off and explains why, as App wires it', async () => {
    r = await render(home('under15', canScreen(true, true, 'under15')));
    expect(shutter(r.el).disabled).toBe(true);
    expect(upload(r.el).disabled).toBe(true);
    const alert = r.el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(t('under15_title'));
    expect(alert?.textContent).toContain(t('under15_body'));
    expect(r.text()).toContain(t('hint_under15'));
  });

  it('keeps the shutter off for under 15 even if a caller wrongly passes ready', async () => {
    r = await render(home('under15', true));
    expect(shutter(r.el).disabled).toBe(true);
    expect(upload(r.el).disabled).toBe(true);
  });

  it('keeps the shutter off until an age band is chosen', async () => {
    r = await render(home(null, canScreen(true, true, null)));
    expect(shutter(r.el).disabled).toBe(true);
    expect(r.text()).toContain(t('hint_age'));
  });

  it('turns the shutter on for 15 and over, with no under-15 note', async () => {
    r = await render(home('25-34', canScreen(true, true, '25-34')));
    expect(shutter(r.el).disabled).toBe(false);
    expect(r.text()).not.toContain(t('under15_title'));
  });

  it('marks the chosen band and reports Under 15 when tapped', async () => {
    const onAge = vi.fn();
    r = await render(home('25-34', true, onAge));
    const pressed = r.el.querySelectorAll('.ages button[aria-pressed="true"]');
    expect([...pressed].map((b) => b.textContent)).toEqual(['25-34']);
    await r.click([...r.el.querySelectorAll('.ages button')].find((b) => b.textContent === t('age_under_15'))!);
    expect(onAge).toHaveBeenCalledWith('under15');
  });
});
