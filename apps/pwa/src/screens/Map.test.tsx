// @vitest-environment jsdom
// Facility map: it opens on the clinic and its nearest facilities, and a city's worth of
// facilities does not turn into a pile of lines.
import { afterEach, describe, expect, it } from 'vitest';
import type { DirectoryCache } from '../lib/referral/api';
import type { Facility } from '../lib/referral/match';
import { render, type Rendered } from '../test/render';
import { MapScreen } from './Map';

let r: Rendered | undefined;
afterEach(() => { r?.unmount(); r = undefined; });

const fac = (id: string, lat: number, lng: number): Facility => ({
  id, name: `Facility ${id}`, district: '', region: 'Greater Accra', lat, lng, phone: '', openingHours: null,
  services: ['tb_rapid_test'], servicesConfirmedAt: null, beds: null,
});
const dirOf = (facilities: Facility[]): DirectoryCache => ({ savedAt: new Date().toISOString(), facilities });
const open = (facilities: Facility[], own: string | null) =>
  render(<MapScreen deps={{ loadDirectory: () => Promise.resolve(dirOf(facilities)), ownFacilityId: () => Promise.resolve(own) }} />);
const box = (el: HTMLElement) => (el.querySelector('svg.map')!.getAttribute('viewBox') as string).split(' ').map(Number); // x y w h

// 24 points inside about 25 km of the home clinic (Brekusu area).
const cluster = [fac('home', 5.7834, -0.2089), ...Array.from({ length: 23 }, (_, i) => fac(`n${i}`, 5.6 + (i % 6) * 0.04, -0.28 + Math.floor(i / 6) * 0.07))];

describe('Map: opening view', () => {
  it('zooms in on the clinic and its neighbours instead of showing all of Ghana', async () => {
    r = await open(cluster, 'home');
    await r.flush();
    const [x, y, w, h] = box(r.el);
    expect(w, 'zoomed in').toBeLessThan(480 / 3);
    const home = { x: (-0.2089 + 3.4) * 100, y: (11.3 - 5.7834) * 100 };
    expect(home.x).toBeGreaterThan(x); expect(home.x).toBeLessThan(x + w);
    expect(home.y).toBeGreaterThan(y); expect(home.y).toBeLessThan(y + h);
  });

  it('keeps the whole-country view when the nearest facilities are far apart', async () => {
    r = await open([fac('home', 5.6, -0.2), fac('a', 6.7, -1.6), fac('b', 9.4, -0.85), fac('c', 10.8, -0.9), fac('d', 4.9, -1.75)], 'home');
    await r.flush();
    expect(box(r.el)[2]).toBeGreaterThan(480 / 2);
  });

  it('draws distance lines to the nearest few only', async () => {
    r = await open(cluster, 'home');
    await r.flush();
    const lines = r.el.querySelectorAll('svg.map line').length;
    expect(lines).toBeGreaterThan(0);
    expect(lines).toBeLessThanOrEqual(6);
  });

  it('does not crash with an empty directory', async () => {
    r = await open([], null);
    await r.flush();
    expect(r.el.querySelector('svg.map') ?? r.el.textContent).toBeTruthy();
  });
});
