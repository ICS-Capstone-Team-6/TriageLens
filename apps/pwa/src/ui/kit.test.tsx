// @vitest-environment jsdom
// Sheet: drag the handle down to close, with Escape and the scrim as the other ways out.
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, type Rendered } from '../test/render';
import { Sheet } from './kit';

let r: Rendered | undefined;
afterEach(() => { r?.unmount(); r = undefined; vi.useRealTimers(); });

const touch = (el: Element, type: string, y: number) =>
  el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId: 1, pointerType: 'touch', clientY: y, button: 0 }));

describe('Sheet', () => {
  it('follows the finger, then slides out and closes after a long drag', async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    r = await render(<Sheet label="Sign in" onClose={close}><p>body</p></Sheet>);
    const grip = r.el.querySelector('.grip')!;
    const sheet = r.el.querySelector('.sheet') as HTMLElement;
    act(() => { touch(grip, 'pointerdown', 100); touch(grip, 'pointermove', 160); });
    expect(sheet.style.transform).toBe('translateY(60px)');
    act(() => { touch(grip, 'pointermove', 260); touch(grip, 'pointerup', 260); });
    expect(close).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes on a quick flick shorter than the long drag', async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    r = await render(<Sheet label="Sign in" onClose={close}><p>body</p></Sheet>);
    const grip = r.el.querySelector('.grip')!;
    act(() => { touch(grip, 'pointerdown', 100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30); });
    act(() => { touch(grip, 'pointermove', 150); touch(grip, 'pointerup', 150); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(close).toHaveBeenCalledOnce();
  });

  it('springs back from a short slow drag and dragging up only stretches it', async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    r = await render(<Sheet label="Sign in" onClose={close}><p>body</p></Sheet>);
    const grip = r.el.querySelector('.grip')!;
    const sheet = r.el.querySelector('.sheet') as HTMLElement;
    act(() => { touch(grip, 'pointerdown', 200); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    act(() => { touch(grip, 'pointermove', 100); });
    expect(parseFloat(sheet.style.transform.replace(/[^-\d.]/g, ''))).toBeGreaterThan(-20); // friction, not 1:1
    act(() => { touch(grip, 'pointermove', 230); touch(grip, 'pointerup', 230); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
  });

  it('still closes with Escape and with the scrim', async () => {
    const close = vi.fn();
    r = await render(<Sheet label="Sign in" onClose={close}><p>body</p></Sheet>);
    act(() => { dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await r.click(r.el.querySelector('.scrim'));
    expect(close).toHaveBeenCalledTimes(2);
  });
});
