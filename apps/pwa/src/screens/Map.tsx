// Facility map (canvas "Map"): every facility in the directory on a drawn outline of Ghana,
// with search, "must have" filters, free beds, and straight-line distances from the chosen
// facility (H17: straight-line, roads may be longer). No map tiles or map library: it works
// offline from the cached directory and adds no weight to the app shell.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DirectoryCache } from '../lib/referral/api';
import { bedState, hoursSince } from '../lib/referral/beds';
import { distanceKm, isOpenAt, type Facility } from '../lib/referral/match';
import { SERVICE_TAGS } from '../lib/referral/rules';
import { t, type StringKey } from '../strings';
import { AlertCircle, Check, Minus, Phone, Plus, Scan, Search } from '../ui/icons';
import { Facts, Notice, TopBar } from '../ui/kit';

export interface MapDeps {
  loadDirectory: () => Promise<DirectoryCache | null>;
  ownFacilityId: () => Promise<string | null>;
}

// Equirectangular projection, 100 units per degree; the base view is 480 x 670 units.
const P = (lat: number, lng: number) => ({ x: (lng + 3.4) * 100, y: (11.3 - lat) * 100 });
const BASE = { w: 480, h: 670, cx: 240, cy: 335 };
const OUTLINE = [[-3.1, 5.1], [-2.95, 6.0], [-3.0, 7.0], [-2.6, 8.2], [-2.8, 9.4], [-2.7, 10.0], [-2.9, 10.7], [-2.85, 11.0], [-1.0, 11.05], [0.0, 11.1], [0.2, 11.0], [0.4, 10.3], [0.3, 9.4], [0.5, 8.3], [0.6, 7.4], [0.9, 6.8], [1.2, 6.1], [0.6, 5.8], [0.0, 5.7], [-0.6, 5.4], [-1.3, 5.05], [-1.8, 4.85], [-2.1, 4.75], [-2.6, 5.0]]
  .map(([lng, lat], i) => { const p = P(lat, lng); return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join(' ') + 'Z';

const svc = (s: string) => t(`service_${s}` as StringKey).replace(/^./, (m) => m.toUpperCase());
const MAX_ZOOM = 5;

type View = { zoom: number; cx: number; cy: number };

export function MapScreen({ deps, dock }: { deps: MapDeps; dock?: React.ReactNode }) {
  const [dir, setDir] = useState<DirectoryCache | null | 'loading'>('loading');
  const [own, setOwn] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [need, setNeed] = useState<string[]>([]);
  const [view, setView] = useState<View>({ zoom: 1, cx: BASE.cx, cy: BASE.cy });
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
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setView(to);
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
    if (view.zoom > 1.01) { const p = P(f.lat, f.lng); glide({ zoom: view.zoom, cx: p.x, cy: p.y }); }
  }

  const W = BASE.w / view.zoom, H = BASE.h / view.zoom, vx = view.cx - W / 2, vy = view.cy - H / 2;
  const k = 1 / Math.sqrt(view.zoom);
  const pos = (x: number, y: number) => ({ left: `${((x - vx) / W) * 100}%`, top: `${((y - vy) / H) * 100}%`, inView: x > vx && x < vx + W && y > vy && y < vy + H });
  const sp = chosen ? P(chosen.lat, chosen.lng) : null;
  const lines = chosen && sp ? shown.filter((f) => f.id !== chosen.id).map((f) => {
    const p = P(f.lat, f.lng);
    return { id: f.id, x1: sp.x, y1: sp.y, x2: p.x, y2: p.y, km: Math.max(1, Math.round(distanceKm(chosen, f))), ...pos((sp.x + p.x) / 2, (sp.y + p.y) / 2) };
  }) : [];

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

  const beds = chosen ? bedState(chosen.beds, now) : 'none';
  const open = chosen ? isOpenAt(chosen.openingHours, now) : null;
  const h = chosen?.beds ? hoursSince(chosen.beds.updatedAt, now) : null;

  return (
    <main className="screen">
      <TopBar title={t('nav_map')} big />
      <div className="body has-dock pane">
        {dir === 'loading' && <p className="t-small" role="status">{t('refer_loading')}</p>}
        {dir === null && <Notice tone="danger" role="alert">{t('refer_no_directory')}</Notice>}
        {dir && dir !== 'loading' && (
          <div className="wide-3 mapgrid">
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

            <div className="mapwrap" aria-label={t('map_label')}>
              <div className="mapbox">
                <svg className="map" viewBox={`${vx} ${vy} ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('map_svg_label')}
                  onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
                  <defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#dfe7f0" strokeWidth="1" /></pattern></defs>
                  <rect x="-400" y="-400" width="1300" height="1500" fill="url(#grid)" />
                  <path d={OUTLINE} fill="#fff" stroke="#bebecc" strokeWidth={2 * k} strokeLinejoin="round" />
                  {lines.map((l) => <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#2597d0" strokeWidth={1.8 * k} strokeDasharray={`${6 * k} ${5 * k}`} strokeLinecap="round" opacity=".85" />)}
                  {all.map((f) => {
                    const p = P(f.lat, f.lng), on = f.id === chosen?.id, low = bedState(f.beds, now) === 'low', mine = f.id === own;
                    return (
                      <circle key={f.id} cx={p.x} cy={p.y} r={(on ? 11 : 7) * k} opacity={matches(f) || mine ? 1 : 0.25}
                        fill={mine ? '#2597d0' : low ? '#fff' : '#070709'} stroke={low ? '#d83a1f' : '#fff'} strokeWidth={(low ? 3 : 2.5) * k}
                        className="mk" onClick={() => pick(f)} />
                    );
                  })}
                </svg>
                {lines.filter((l) => l.inView).map((l) => <span key={l.id} className="lbl num" style={{ left: l.left, top: l.top }}>{l.km} km</span>)}
                {all.map((f) => {
                  const p = P(f.lat, f.lng), ps = pos(p.x, p.y);
                  return ps.inView && (f.id === chosen?.id || view.zoom > 1.6) ? <span key={f.id} className="nm2" style={{ left: ps.left, top: ps.top }}>{f.name}</span> : null;
                })}
              </div>
              <div className="tools" role="group" aria-label={t('map_zoom')}>
                <button type="button" aria-label={t('map_zoom_in')} onClick={() => zoomTo(Math.min(MAX_ZOOM, view.zoom * 1.5))}><Plus size={18} /></button>
                <button type="button" aria-label={t('map_zoom_out')} onClick={() => zoomTo(Math.max(1, view.zoom / 1.5))}><Minus size={18} /></button>
                <button type="button" aria-label={t('map_zoom_all')} onClick={() => zoomTo(1)}><Scan size={18} /></button>
              </div>
              <p className="map-key"><span><i style={{ background: '#2597d0' }} />{t('map_key_you')}</span><span><i style={{ background: '#070709' }} />{t('map_key_fac')}</span><span><i style={{ background: '#fff', boxShadow: 'inset 0 0 0 2px #d83a1f' }} />{t('map_key_low')}</span></p>
            </div>

            {chosen && (
              <aside className="stack map-sel" aria-label={t('map_selected')} aria-live="polite">
                <div className="stack-tight">
                  <h2 className="t-title" style={{ fontSize: 24 }}>{chosen.name}</h2>
                  <p className="t-small">{[chosen.district, chosen.region].filter(Boolean).join(', ')}{home && chosen.id !== own ? `, ${t('map_km_from_you', { km: Math.max(1, Math.round(distanceKm(home, chosen))) })}` : ''}</p>
                </div>
                {chosen.beds && chosen.beds.total > 0 && (
                  <div className="cloud" style={{ gap: 8, padding: 16 }}>
                    <span className="row"><span className="t-sub">{t('map_beds_free')}</span><span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{chosen.beds.free} / {chosen.beds.total}</span></span>
                    <span className="bedbar" aria-hidden="true"><i style={{ width: `${Math.round((chosen.beds.free / chosen.beds.total) * 100)}%`, background: beds === 'low' ? '#d83a1f' : '#070709' }} /></span>
                    <span className="t-cap">{h === null ? t('beds_not_updated') : t('beds_updated_ago', { h })}</span>
                  </div>
                )}
                {beds === 'low' && chosen.id !== own && <Notice tone="danger">{t('map_low_flag')}</Notice>}
                {beds === 'stale' && <Notice tone="warn">{t('beds_stale', { h: h ?? 0 })}</Notice>}
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
                <p className="t-cap"><AlertCircle size={13} /> {t('map_straight_line')}</p>
              </aside>
            )}
            <section className="stack map-list" aria-label={t('map_results')}>
              <p className="t-cap num" role="status">{t('map_shown', { n: shown.length })}</p>
              {shown.length === 0 && (
                <div className="cloud">
                  <p className="t-sub">{t('map_none')}</p>
                  <button className="btn btn-ghost btn-full" type="button" style={{ background: '#fff' }} onClick={() => { setQ(''); setNeed([]); }}>{t('map_clear')}</button>
                </div>
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
