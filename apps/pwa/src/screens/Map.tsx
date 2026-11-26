// Facility map (canvas "Map"): every facility in the directory, with search, "must have"
// filters, free beds, and straight-line distances from the chosen facility (H17: straight-line,
// roads may be longer). The background is OpenStreetMap tiles when the phone is online, drawn as
// plain images under the pins (no map library, nothing added to the app shell). Offline, or if
// tiles are blocked, the drawn outline of Ghana shows instead, so the map still works from the
// cached directory. The list on the left and the details on the right can be hidden.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DirectoryCache } from '../lib/referral/api';
import { bedState, hoursSince } from '../lib/referral/beds';
import { distanceKm, isOpenAt, type Facility, type Point } from '../lib/referral/match';
import { loadRoute, type RouteInfo } from '../lib/referral/route';
import { SERVICE_TAGS } from '../lib/referral/rules';
import { t, type StringKey } from '../strings';
import { AlertCircle, Check, Info, List, MapIcon, Minus, Phone, Plus, Scan, Search, WifiOff } from '../ui/icons';
import { Empty, Facts, Notice, TopBar } from '../ui/kit';

export interface MapDeps {
  loadDirectory: () => Promise<DirectoryCache | null>;
  ownFacilityId: () => Promise<string | null>;
  /** Drive route from the clinic to a facility. Defaults to OSRM with an offline estimate; tests and the demo inject their own. */
  route?: (from: Point, to: Point, now: Date) => Promise<RouteInfo>;
}

// Web Mercator (the projection of OpenStreetMap tiles), 100 units per degree of longitude;
// the base view, all of Ghana, is about 480 x 670 units.
const M = (lat: number) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const M0 = M(11.3);
const P = (lat: number, lng: number) => ({ x: (lng + 3.4) * 100, y: (M0 - M(lat)) * 100 });
const WORLD = 36000; // units across the whole world at 100 units per degree
const X0 = -(180 - 3.4) * 100, Y0 = (M0 - 180) * 100; // unit position of the world's top-left corner
const TILE_URL = (import.meta.env.VITE_TILE_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const BASE = { w: 480, h: 670, cx: 240, cy: 335 };
const OUTLINE = [[-3.1, 5.1], [-2.95, 6.0], [-3.0, 7.0], [-2.6, 8.2], [-2.8, 9.4], [-2.7, 10.0], [-2.9, 10.7], [-2.85, 11.0], [-1.0, 11.05], [0.0, 11.1], [0.2, 11.0], [0.4, 10.3], [0.3, 9.4], [0.5, 8.3], [0.6, 7.4], [0.9, 6.8], [1.2, 6.1], [0.6, 5.8], [0.0, 5.7], [-0.6, 5.4], [-1.3, 5.05], [-1.8, 4.85], [-2.1, 4.75], [-2.6, 5.0]]
  .map(([lng, lat], i) => { const p = P(lat, lng); return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join(' ') + 'Z';

const svc = (s: string) => t(`service_${s}` as StringKey).replace(/^./, (m) => m.toUpperCase());
const MAX_ZOOM = 24; // far enough in to pull apart a city's worth of facilities (about 20 km across)
const MAX_TILES = 80; // never ask the tile server for more than this at once
const NEAR = 6; // the opening view frames your clinic and this many of its nearest facilities

type View = { zoom: number; cx: number; cy: number };

/** A view that frames these points with some room around them. */
function fitPoints(pts: { x: number; y: number }[], cw: number, ch: number): View {
  if (!pts.length) return { zoom: 1, cx: BASE.cx, cy: BASE.cy };
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 12) * 1.5, h = Math.max(maxY - minY, 12) * 1.5; // 12 units is about 13 km
  const s1 = Math.max(BASE.w / cw, BASE.h / ch); // units per pixel when all of Ghana is in frame
  return { zoom: Math.max(1, Math.min(MAX_ZOOM, (cw * s1) / w, (ch * s1) / h)), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** Opening view: the clinic (or the list's centre) with its nearest facilities in frame. */
function fitView(from: Facility | null, facs: Facility[], cw: number, ch: number): View {
  const near = from ? [from, ...facs.filter((f) => f.id !== from.id).sort((a, b) => distanceKm(from, a) - distanceKm(from, b)).slice(0, NEAR + 2)] : facs;
  return fitPoints(near.map((f) => P(f.lat, f.lng)), cw, ch);
}

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const span = (min: number) => { const m = Math.max(1, Math.round(min)); return m < 60 ? t('map_eta_min', { n: m }) : t('map_eta_hm', { h: Math.floor(m / 60), m: m % 60 }); };

/** OpenStreetMap tiles under the pins. Plain images: no library, nothing stored by the app. */
function Tiles({ cw, vx, vy, W, H, onLoad }: { cw: number; vx: number; vy: number; W: number; H: number; onLoad: () => void }) {
  const n = Math.max(0, Math.min(18, Math.round(Math.log2((WORLD * cw) / (W * 256)))));
  const T = WORLD / 2 ** n, last = 2 ** n - 1;
  const x0 = Math.max(0, Math.floor((vx - X0) / T)), x1 = Math.min(last, Math.floor((vx + W - X0) / T));
  const y0 = Math.max(0, Math.floor((vy - Y0) / T)), y1 = Math.min(last, Math.floor((vy + H - Y0) / T));
  const tiles: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tiles.length < MAX_TILES) tiles.push({ x, y });
  return (
    <div className="tiles" aria-hidden="true">
      {tiles.map(({ x, y }) => (
        <img key={`${n}/${x}/${y}`} alt="" draggable={false} crossOrigin="anonymous" referrerPolicy="strict-origin-when-cross-origin" decoding="async"
          src={TILE_URL.replace('{z}', String(n)).replace('{x}', String(x)).replace('{y}', String(y))}
          style={{ left: `${((x * T + X0 - vx) / W) * 100}%`, top: `${((y * T + Y0 - vy) / H) * 100}%`, width: `${(T / W) * 100 + 0.15}%`, height: `${(T / H) * 100 + 0.15}%` }}
          onLoad={onLoad} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      ))}
    </div>
  );
}

export function MapScreen({ deps, dock }: { deps: MapDeps; dock?: React.ReactNode }) {
  const [dir, setDir] = useState<DirectoryCache | null | 'loading'>('loading');
  const [own, setOwn] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [need, setNeed] = useState<string[]>([]);
  const [view, setView] = useState<View>({ zoom: 1, cx: BASE.cx, cy: BASE.cy });
  const [showFind, setShowFind] = useState(true);
  const [showSel, setShowSel] = useState(true);
  const [tilesOk, setTilesOk] = useState(false);
  const [route, setRoute] = useState<{ id: string; info: RouteInfo; at: Date } | null>(null);
  const [size, setSize] = useState({ cw: BASE.w, ch: BASE.h });
  const mapRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const raf = useRef(0);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; w: number; id: number } | null>(null);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let live = true;
    void Promise.all([deps.loadDirectory(), deps.ownFacilityId()]).then(([d, o]) => { if (live) { setDir(d); setOwn(o); } });
    return () => { live = false; cancelAnimationFrame(raf.current); };
  }, [deps]);

  // The map takes the size of its area (it is not a fixed portrait box), and opens fitted once.
  const hasMap = Boolean(dir && dir !== 'loading');
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ cw: r.width, ch: r.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasMap, showFind, showSel]);
  useEffect(() => {
    if (fitted.current || !dir || dir === 'loading') return;
    fitted.current = true;
    const r = mapRef.current?.getBoundingClientRect();
    const facs = dir.facilities;
    setView(fitView(facs.find((f) => f.id === own) ?? null, facs, r && r.width > 0 ? r.width : BASE.w, r && r.height > 0 ? r.height : BASE.h));
  }, [dir, own]);

  const all: Facility[] = dir && dir !== 'loading' ? dir.facilities : [];
  const home = all.find((f) => f.id === own) ?? null;
  const term = q.trim().toLowerCase();
  const matches = (f: Facility) =>
    (!term || `${f.name} ${f.district} ${f.region} ${f.services.map(svc).join(' ')}`.toLowerCase().includes(term)) &&
    need.every((n) => f.services.includes(n));
  const shown = all.filter(matches).sort((a, b) => (home ? distanceKm(home, a) - distanceKm(home, b) : a.name.localeCompare(b.name)));
  const chosen = all.find((f) => f.id === sel) ?? shown.find((f) => f.id !== own) ?? null;

  // Glide to a new view (spatial consistency): 240 ms strong ease-out; reduced motion jumps.
  function glide(to: View) {
    cancelAnimationFrame(raf.current);
    if (typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return setView(to);
    const from = viewRef.current, start = performance.now();
    const step = (tm: number) => {
      const k = Math.min(1, (tm - start) / 240), e = 1 - Math.pow(1 - k, 5);
      setView({ zoom: from.zoom + (to.zoom - from.zoom) * e, cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e });
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }
  function pick(f: Facility) {
    setSel(f.id);
    setShowSel(true);
    const r = mapRef.current?.getBoundingClientRect();
    const cw0 = r && r.width > 0 ? r.width : BASE.w, ch0 = r && r.height > 0 ? r.height : BASE.h;
    if (home && f.id !== home.id) glide(fitPoints([P(home.lat, home.lng), P(f.lat, f.lng)], cw0, ch0)); // frame the trip
    else if (view.zoom > 1.01) { const p = P(f.lat, f.lng); glide({ zoom: view.zoom, cx: p.x, cy: p.y }); }
  }

  // The drive from your clinic to the chosen facility, with arrival time. Never blocks anything.
  const rid = chosen && home && chosen.id !== home.id ? chosen.id : null;
  useEffect(() => {
    if (!rid || !home || !chosen) { setRoute(null); return; }
    let live = true;
    setRoute(null);
    const at = new Date();
    void (deps.route ?? loadRoute)(home, chosen, at).then((info) => {
      if (!live) return;
      setRoute({ id: rid, info, at });
      const r = mapRef.current?.getBoundingClientRect();
      glide(fitPoints((info.path ?? [home, chosen]).map((q) => P(q.lat, q.lng)), r && r.width > 0 ? r.width : BASE.w, r && r.height > 0 ? r.height : BASE.h));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid, home?.id, deps]);

  const { cw, ch } = size;
  const s1 = Math.max(BASE.w / cw, BASE.h / ch);
  const W = (cw * s1) / view.zoom, H = (ch * s1) / view.zoom, vx = view.cx - W / 2, vy = view.cy - H / 2;
  const u = W / cw; // map units per screen pixel: pins and lines keep one size on screen at every zoom
  const pos = (x: number, y: number) => ({ left: `${((x - vx) / W) * 100}%`, top: `${((y - vy) / H) * 100}%`, inView: x > vx && x < vx + W && y > vy && y < vy + H });
  const sp = chosen ? P(chosen.lat, chosen.lng) : null;
  const zoomTo = (z: number) => { const c = sp ?? { x: view.cx, y: view.cy }; glide({ zoom: z, cx: z <= 1 ? BASE.cx : c.x, cy: z <= 1 ? BASE.cy : c.y }); };
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current) return; // one finger only
    cancelAnimationFrame(raf.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, w: e.currentTarget.getBoundingClientRect().width, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const s = W / d.w;
    setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) * s, cy: d.cy - (e.clientY - d.y) * s }));
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => { if (drag.current?.id === e.pointerId) drag.current = null; };
  const onWheel = (e: React.WheelEvent) => { cancelAnimationFrame(raf.current); setView((v) => ({ ...v, zoom: e.deltaY < 0 ? Math.min(MAX_ZOOM, v.zoom * 1.2) : Math.max(1, v.zoom / 1.2) })); };

  // Names: only the chosen facility and your clinic. Every other pin is a tap away.
  const labels = [chosen, home].filter((f, i, xs): f is Facility => Boolean(f) && xs.indexOf(f) === i).map((f) => ({ f, ...pos(P(f.lat, f.lng).x, P(f.lat, f.lng).y) })).filter((l) => l.inView);

  const beds = chosen ? bedState(chosen.beds, now) : 'none';
  const open = chosen ? isOpenAt(chosen.openingHours, now) : null;
  const h = chosen?.beds ? hoursSince(chosen.beds.updatedAt, now) : null;

  return (
    <main className="screen">
      <TopBar title={t('nav_map')} big />
      <div className="body has-dock pane">
        {dir === 'loading' && <p className="t-small" role="status">{t('refer_loading')}</p>}
        {dir === null && <Empty tone="problem" role="alert" icon={<WifiOff size={26} />} title={t('directory_missing_title')} body={t('refer_no_directory')} />}
        {dir && dir !== 'loading' && dir.facilities.length === 0 && <Empty icon={<MapIcon size={26} />} title={t('directory_empty_title')} body={t('directory_empty')} />}
        {dir && dir !== 'loading' && (
          <div className={`wide-3 mapgrid${showFind ? '' : ' no-find'}${showSel ? '' : ' no-sel'}`}>
            <aside className="stack map-find" aria-label={t('map_find')}>
              <label className="search">
                <span className="sr">{t('map_search')}</span>
                <Search size={18} color="#60606c" />
                <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('map_search_ph')} />
              </label>
              <details className="must">
                <summary>{t('map_must_have')}{need.length > 0 && ` (${need.length})`}</summary>
                <fieldset>
                  <legend className="sr">{t('map_must_have')}</legend>
                  {SERVICE_TAGS.map((s) => (
                    <label className="mini-check" key={s}><input type="checkbox" checked={need.includes(s)} onChange={() => setNeed((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))} />{svc(s)}</label>
                  ))}
                </fieldset>
              </details>
            </aside>

            <div className="mapwrap" aria-label={t('map_label')} ref={mapRef}>
              <div className="mapbox">
                <Tiles cw={cw} vx={vx} vy={vy} W={W} H={H} onLoad={() => setTilesOk(true)} />
                <svg className={`map${tilesOk ? ' tiled' : ''}`} viewBox={`${vx} ${vy} ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('map_svg_label')}
                  onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
                  <defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#dfe7f0" strokeWidth="1" /></pattern></defs>
                  <rect className="grid-bg" x="-400" y="-400" width="1300" height="1500" fill="url(#grid)" />
                  <path className="outline" d={OUTLINE} fill="#fff" stroke="#bebecc" strokeWidth={2 * u} strokeLinejoin="round" />
                  {route && home && chosen && route.id === chosen.id && (() => {
                    const pts = (route.info.path ?? [home, chosen]).map((q) => { const p = P(q.lat, q.lng); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(' ');
                    return (
                      <>
                        <polyline points={pts} fill="none" stroke="#fff" strokeWidth={9 * u} strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points={pts} fill="none" stroke="#2597d0" strokeWidth={5 * u} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route.info.path ? undefined : `${9 * u} ${8 * u}`} />
                      </>
                    );
                  })()}
                  {all.map((f) => {
                    const p = P(f.lat, f.lng), on = f.id === chosen?.id, low = bedState(f.beds, now) === 'low', mine = f.id === own;
                    return (
                      <g key={f.id} className="mk" onClick={() => pick(f)} opacity={matches(f) || mine ? 1 : 0.25}>
                        <circle cx={p.x} cy={p.y} r={22 * u} fill="transparent" />
                        <circle cx={p.x} cy={p.y} r={(on ? 12 : 8.5) * u} fill={mine ? '#2597d0' : low ? '#fff' : '#070709'} stroke={low ? '#d83a1f' : '#fff'} strokeWidth={(low ? 3 : 2.5) * u} />
                      </g>
                    );
                  })}
                </svg>
                {labels.map((l) => <span key={l.f.id} className="nm2" style={{ left: l.left, top: l.top }}>{l.f.name}</span>)}
                {chosen && home && chosen.id !== home.id && (
                  <p className="route-chip" role="status">
                    {route && route.id === chosen.id
                      ? <><b className="num">{t('map_route_value', { km: route.info.km < 10 ? route.info.km.toFixed(1) : Math.round(route.info.km), time: span(route.info.minutes) })}</b><span>{t('map_arrive', { time: clock.format(new Date(route.at.getTime() + route.info.minutes * 60000)) })}</span></>
                      : <span>{t('map_route_loading')}</span>}
                  </p>
                )}
              </div>
              <div className="tools" role="group" aria-label={t('map_zoom')}>
                <button type="button" aria-label={t('map_zoom_in')} onClick={() => zoomTo(Math.min(MAX_ZOOM, view.zoom * 1.5))}><Plus size={18} /></button>
                <button type="button" aria-label={t('map_zoom_out')} onClick={() => zoomTo(Math.max(1, view.zoom / 1.5))}><Minus size={18} /></button>
                <button type="button" aria-label={t('map_zoom_all')} onClick={() => zoomTo(1)}><Scan size={18} /></button>
              </div>
              <button className="pbtn pbtn-l" type="button" aria-expanded={showFind} onClick={() => setShowFind((v) => !v)}><List size={18} />{showFind ? t('map_hide_list') : t('map_show_list')}</button>
              <button className="pbtn pbtn-r" type="button" aria-expanded={showSel} onClick={() => setShowSel((v) => !v)}><Info size={18} />{showSel ? t('map_hide_details') : t('map_show_details')}</button>
              {tilesOk && <a className="osm" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"><span>© OpenStreetMap contributors</span></a>}
              <p className="map-key"><span><i style={{ background: '#2597d0' }} />{t('map_key_you')}</span><span><i style={{ background: '#070709' }} />{t('map_key_fac')}</span><span><i style={{ background: '#fff', boxShadow: 'inset 0 0 0 2px #d83a1f' }} />{t('map_key_low')}</span></p>
            </div>

            {chosen && showSel && (
              <aside className="stack map-sel" aria-label={t('map_selected')} aria-live="polite">
                <div className="stack-tight">
                  <h2 className="t-title" style={{ fontSize: 24 }}>{chosen.name}</h2>
                  <p className="t-small">{[chosen.district, chosen.region].filter(Boolean).join(', ')}{home && chosen.id !== own ? `, ${t('map_km_from_you', { km: Math.max(1, Math.round(distanceKm(home, chosen))) })}` : ''}</p>
                </div>
                {route && home && chosen.id !== home.id && route.id === chosen.id && (
                  <div className="cloud" style={{ gap: 6, padding: 16 }}>
                    <span className="t-sub">{t('map_route_from', { name: home.name })}</span>
                    <span className="num" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.03em' }}>{t('map_route_value', { km: route.info.km < 10 ? route.info.km.toFixed(1) : Math.round(route.info.km), time: span(route.info.minutes) })}</span>
                    <span className="t-small">{t('map_arrive', { time: clock.format(new Date(route.at.getTime() + route.info.minutes * 60000)) })}, {t(`map_traffic_${route.info.traffic}` as StringKey)}</span>
                    <span className="t-cap">{route.info.source === 'road' ? t('map_route_note') : t('map_route_estimate')}</span>
                  </div>
                )}
                {chosen.beds && chosen.beds.total > 0 && (
                  <div className="cloud" style={{ gap: 8, padding: 16 }}>
                    <span className="row"><span className="t-sub">{t('map_beds_free')}</span><span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{chosen.beds.free} / {chosen.beds.total}</span></span>
                    <span className="bedbar" aria-hidden="true"><i style={{ width: `${Math.round((chosen.beds.free / chosen.beds.total) * 100)}%`, background: beds === 'low' ? '#d83a1f' : '#070709' }} /></span>
                    <span className="t-cap">{h === null ? t('beds_not_updated') : t('beds_updated_ago', { h })}</span>
                  </div>
                )}
                {beds === 'low' && chosen.id !== own && <Notice tone="danger">{t('map_low_flag')}</Notice>}
                {beds === 'stale' && <Notice tone="warn">{h === null ? t('beds_never_updated') : t('beds_stale', { h })}</Notice>}
                <section className="stack-tight" aria-labelledby="eq-h">
                  <h3 className="t-sub" id="eq-h">{t('map_services')}</h3>
                  <ul className="eq">
                    {SERVICE_TAGS.map((s) => {
                      const has = chosen.services.includes(s);
                      return <li key={s} className={has ? '' : 'no'}>{has ? <Check size={18} color="#2597d0" /> : <Minus size={18} color="#bebecc" />}{svc(s)}{!has && <span className="sr"> {t('map_not_available')}</span>}</li>;
                    })}
                  </ul>
                </section>
                <Facts rows={[
                  [t('map_open'), open === true ? t('open_now') : open === false ? t('closed_now') : t('hours_unknown')],
                  ...(chosen.phone ? [[t('map_phone'), <span key="p" className="num">{chosen.phone}</span>] as [string, React.ReactNode]] : []),
                ]} />
                {chosen.phone && <a className="btn btn-ghost btn-full" href={`tel:${chosen.phone}`}><Phone />{t('map_call')}</a>}
                {!(route && route.id === chosen.id) && <p className="t-cap"><AlertCircle size={13} /> {t('map_straight_line')}</p>}
              </aside>
            )}
            <section className="stack map-list" aria-label={t('map_results')}>
              <p className="t-cap num" role="status">{t('map_shown', { n: shown.length })}</p>
              {shown.length === 0 && (
                <Empty icon={<Search size={26} />} title={t('map_none_title')} body={t('map_none')}
                  action={<button className="btn btn-ghost" type="button" style={{ background: '#fff' }} onClick={() => { setQ(''); setNeed([]); }}>{t('map_clear')}</button>} />
              )}
              <ul className="res" aria-label={t('map_results')}>
                {shown.map((f) => {
                  const st = bedState(f.beds, now);
                  return (
                    <li key={f.id}>
                      <button type="button" aria-pressed={f.id === chosen?.id} onClick={() => pick(f)}>
                        <span className="stack-tight" style={{ minWidth: 0 }}><span className="nm">{f.name}</span><span className="rg">{f.district}</span></span>
                        <span className={`num bedn${st === 'low' ? ' low' : ''}`}>{f.id === own ? t('map_you') : f.beds && f.beds.total > 0 ? `${f.beds.free} / ${f.beds.total}` : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </div>
      {dock}
    </main>
  );
}
