// @vitest-environment jsdom
// Facility map: it opens on the clinic and its nearest facilities, and a city's worth of
// facilities does not turn into a pile of lines.
import { act } from 'react';
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
import type { RouteInfo } from '../lib/referral/route';
const road = (over: Partial<RouteInfo> = {}): RouteInfo => ({ km: 14.2, minutes: 28, traffic: 'moderate', source: 'road', path: [{ lat: 5.7834, lng: -0.2089 }, { lat: 5.74, lng: -0.2 }, { lat: 5.7, lng: -0.19 }], ...over });
const open = (facilities: Facility[], own: string | null, route: RouteInfo | (() => Promise<RouteInfo>) = road()) =>
  render(<MapScreen deps={{ loadDirectory: () => Promise.resolve(dirOf(facilities)), ownFacilityId: () => Promise.resolve(own),
    route: typeof route === 'function' ? route : () => Promise.resolve(route) }} />);
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
    r = await open([fac('home', 5.6, -0.2), fac('a', 6.7, -1.6), fac('b', 9.4, -0.85), fac('c', 10.8, -0.9), fac('d', 4.9, -1.75)], 'home', () => new Promise<RouteInfo>(() => {})); // route not back yet: opening view only
    await r.flush();
    expect(box(r.el)[2]).toBeGreaterThan(480 / 2);
  });

  it('draws no web of distance lines: one route at most', async () => {
    r = await open(cluster, 'home');
    await r.flush();
    expect(r.el.querySelectorAll('svg.map line').length).toBe(0);
    expect(r.el.querySelectorAll('svg.map polyline').length).toBeLessThanOrEqual(2); // white casing and blue line of one route
    expect(r.el.querySelectorAll('.lbl').length).toBe(0);
  });

  it('does not crash with an empty directory', async () => {
    r = await open([], null);
    await r.flush();
    expect(r.el.querySelector('svg.map') ?? r.el.textContent).toBeTruthy();
  });
});

describe('Map: OpenStreetMap tiles', () => {
  it('draws tiles from OpenStreetMap, sending only the site origin as referrer, and credits them once loaded', async () => {
    r = await open(cluster, 'home');
    await r.flush();
    const imgs = [...r.el.querySelectorAll('.tiles img')] as HTMLImageElement[];
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs.length).toBeLessThanOrEqual(80);
    expect(imgs[0].src).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
    expect(imgs[0].getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(imgs[0].getAttribute('crossorigin')).toBe('anonymous');
    expect(r.el.querySelector('.osm'), 'no credit before a tile has loaded').toBeNull();
    await act(async () => { imgs[0].dispatchEvent(new Event('load')); });
    expect(r.el.querySelector('.osm')?.textContent).toContain('OpenStreetMap');
  });

  it('puts the home clinic on the right tile: Brekusu is north of Accra, east of Weija', async () => {
    r = await open([fac('home', 5.7834, -0.2089)], 'home');
    await r.flush();
    const pin = r.el.querySelector('svg.map g.mk circle:last-child') as SVGCircleElement;
    expect(Number(pin.getAttribute('cy'))).toBeGreaterThan(0);
    expect(Number(pin.getAttribute('cx'))).toBeCloseTo((-0.2089 + 3.4) * 100, 0);
  });
});

describe('Map: hide the list and the details', () => {
  const label = (el: HTMLElement, cls: string) => (el.querySelector(cls) as HTMLButtonElement);
  it('hides each side on its own and brings it back', async () => {
    r = await open(cluster, 'home');
    await r.flush();
    const grid = r.el.querySelector('.mapgrid')!;
    expect(r.el.querySelector('.map-sel')).not.toBeNull();
    await r.click(label(r.el, '.pbtn-l'));
    expect(grid.classList.contains('no-find')).toBe(true);
    expect(label(r.el, '.pbtn-l').getAttribute('aria-expanded')).toBe('false');
    await r.click(label(r.el, '.pbtn-r'));
    expect(grid.classList.contains('no-sel')).toBe(true);
    expect(r.el.querySelector('.map-sel')).toBeNull();
    await r.click(label(r.el, '.pbtn-l'));
    await r.click(label(r.el, '.pbtn-r'));
    expect(grid.classList.contains('no-find') || grid.classList.contains('no-sel')).toBe(false);
  });

  it('opens the details again when a pin is tapped', async () => {
    r = await open(cluster, 'home');
    await r.flush();
    await r.click(label(r.el, '.pbtn-r'));
    expect(r.el.querySelector('.map-sel')).toBeNull();
    await act(async () => { r!.el.querySelector('svg.map g.mk')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(r.el.querySelector('.map-sel')).not.toBeNull();
  });

  it('names only the chosen facility and your clinic', async () => {
    r = await open(cluster, 'home');
    await r.flush();
    const names = [...r.el.querySelectorAll('.nm2')].map((e) => e.textContent);
    expect(names.length).toBeLessThanOrEqual(2);
    expect(names).toContain('Facility home');
  });
});

describe('Map: route to the chosen hospital', () => {
  it('shows km, minutes and arrival time on the map and in the details', async () => {
    r = await open(cluster, 'home');
    await r.flush();
    const chip = r.el.querySelector('.route-chip')!;
    expect(chip.textContent).toContain('14 km, 28 min');
    expect(chip.textContent).toMatch(/Arrive about \d\d:\d\d/);
    expect(r.el.querySelector('.map-sel')!.textContent).toContain('Drive from Facility home');
    expect(r.el.querySelector('.map-sel')!.textContent).toContain('moderate traffic');
    expect(r.el.querySelector('.map-sel')!.textContent).toContain('not live');
    expect(r.el.querySelectorAll('svg.map polyline').length).toBe(2);
  });

  it('shows hours and minutes for a long drive', async () => {
    r = await open(cluster, 'home', road({ km: 96.4, minutes: 135 }));
    await r.flush();
    expect(r.el.querySelector('.route-chip')!.textContent).toContain('96 km, 2 h 15 min');
  });

  it('says it is a rough estimate when no road route could be loaded, and still shows a trip', async () => {
    r = await open(cluster, 'home', road({ source: 'estimate', path: null }));
    await r.flush();
    expect(r.el.querySelector('.map-sel')!.textContent).toContain('rough estimate');
    expect(r.el.querySelector('.map-sel')!.textContent).not.toContain('Road route from OpenStreetMap');
    expect(r.el.querySelectorAll('svg.map polyline').length).toBe(2); // a dashed straight line between the two
  });

  it('shows "Finding the route" while it loads and never blocks the map', async () => {
    r = await open(cluster, 'home', () => new Promise<RouteInfo>(() => {}));
    await r.flush();
    expect(r.el.querySelector('.route-chip')!.textContent).toContain('Finding the route');
    expect(r.el.querySelectorAll('svg.map g.mk').length).toBe(cluster.length);
  });

  it('has no route chip when there is no home clinic', async () => {
    r = await open(cluster, null);
    await r.flush();
    expect(r.el.querySelector('.route-chip')).toBeNull();
  });
});
