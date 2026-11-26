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

  it('keeps the shutter off with no age band even if a caller wrongly passes ready', async () => {
    r = await render(home(null, true));
    expect(shutter(r.el).disabled).toBe(true);
    expect(upload(r.el).disabled).toBe(true);
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

// The Screen tab is the camera (like the phone's camera app), not a button that opens it.
describe('Home: live camera', () => {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const withCamera = (gum: () => Promise<MediaStream>) =>
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn(gum) }, configurable: true });
  afterEach(() => { vi.restoreAllMocks(); track.stop.mockClear(); Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }); });

  it('shows the live camera at once, with no drawn film, and stops it when the screen closes', async () => {
    withCamera(() => Promise.resolve(stream));
    r = await render(home('25-34', true));
    await r.flush();
    expect(r.el.querySelector('video.cam-video.on')).not.toBeNull();
    expect(r.el.querySelector('.cam-film'), 'the drawn film is only the fallback').toBeNull();
    expect(r.text()).not.toContain(t('cam_denied'));
    r.unmount(); r = undefined;
    expect(track.stop).toHaveBeenCalled();
  });

  it('the shutter takes a frame from the live camera and hands it on', async () => {
    withCamera(() => Promise.resolve(stream));
    const onFile = vi.fn();
    r = await render(<Home age="25-34" onAge={() => {}} onFile={onFile} ready modelReady onMonitor={() => {}} onSignOut={null} backendNote={false} tabs={[]} />);
    await r.flush();
    const video = r.el.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { value: 1080 });
    Object.defineProperty(video, 'videoHeight', { value: 1920 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'], { type: 'image/jpeg' })));
    await r.click(shutter(r.el));
    expect(onFile).toHaveBeenCalledOnce();
    expect((onFile.mock.calls[0][0] as File).type).toBe('image/jpeg');
  });

  it('under 15 stays blocked even with the camera live (H5)', async () => {
    withCamera(() => Promise.resolve(stream));
    const onFile = vi.fn();
    r = await render(<Home age="under15" onAge={() => {}} onFile={onFile} ready modelReady onMonitor={() => {}} onSignOut={null} backendNote={false} tabs={[]} />);
    await r.flush();
    expect(shutter(r.el).disabled).toBe(true);
    await r.click(shutter(r.el));
    expect(onFile).not.toHaveBeenCalled();
  });

  it('no age band stays blocked even with the camera live (H5)', async () => {
    withCamera(() => Promise.resolve(stream));
    const onFile = vi.fn();
    r = await render(<Home age={null} onAge={() => {}} onFile={onFile} ready modelReady onMonitor={() => {}} onSignOut={null} backendNote={false} tabs={[]} />);
    await r.flush();
    await r.click(shutter(r.el));
    expect(onFile).not.toHaveBeenCalled();
  });

  it('says so when the camera is off for the app, and the shutter falls back to the phone camera picker', async () => {
    withCamera(() => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })));
    r = await render(home('25-34', true));
    await r.flush();
    expect(r.text()).toContain(t('cam_denied'));
    expect(r.el.querySelector('video.on')).toBeNull();
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await r.click(shutter(r.el));
    expect(pick).toHaveBeenCalled();
  });

  it('says so when there is no live camera support at all', async () => {
    r = await render(home('25-34', true));
    await r.flush();
    expect(r.text()).toContain(t('cam_unavailable'));
  });
});
