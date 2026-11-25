// Facility page (E10-09, adds to E10-02; ADR-28 section 6). For admins:
//  - Services: the facility keeps its own service list up to date (hazard H16). Saving,
//    even with no change, records today as "last confirmed".
//  - Referral numbers: weekly counts, no patient identifiers. A maintainer sees all facilities.
import { useEffect, useState } from 'react';
import { SERVICE_TAGS } from '../lib/referral/rules';
import { share, type Count, type FacilityDeps, type FacilityStats, type MyFacility } from '../lib/referral/stats';
import { t, type StringKey } from '../strings';
import { Empty, Notice, Stepper, TopBar } from '../ui/kit';
import { Chart, WifiOff } from '../ui/icons';
import { hoursSince, LOW_BEDS } from '../lib/referral/beds';

const WEEKS = 8;

/** "23 Nov" for the Monday a week starts on. */
function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : iso;
}

function daysAgo(iso: string | null): number | null {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? Math.max(0, Math.floor((Date.now() - ms) / 86_400_000)) : null;
}

const c = (n: Count) => (n === null ? t('stats_fewer_than_5') : String(n));

function Numbers({ f }: { f: FacilityStats }) {
  const sum = f.totals;
  const arrived = share(sum.arrived, sum.sent);
  const confirmed = share(sum.confirmed, sum.tested);
  const amb = share(sum.ambSeen10min, sum.ambRequests);
  return (
    <section className="card" aria-label={f.facilityName}>
      <h3 className="t-sub">{f.facilityName}</h3>
      <dl className="facts">
        <div><dt>{t('stats_sent')}</dt><dd className="num">{c(sum.sent)}</dd></div>
        <div><dt>{t('stats_arrived')}</dt><dd className="num">{arrived.text || c(sum.arrived)}</dd></div>
        <div><dt>{t('stats_confirmed')}</dt><dd className="num">{confirmed.text || c(sum.confirmed)}</dd></div>
        <div><dt>{t('stats_not_arrived')}</dt><dd className="num">{c(sum.notArrived7d)}</dd></div>
        <div><dt>{t('stats_received')}</dt><dd className="num">{c(sum.received)}</dd></div>
        <div><dt>{t('stats_amb_in_time')}</dt><dd className="num">{amb.text || c(sum.ambSeen10min)}</dd></div>
      </dl>
      <div className="table-box">
        <table className="num stats-table">
          <caption className="sr">{t('stats_table_caption', { name: f.facilityName })}</caption>
          <thead><tr><th scope="col">{t('stats_week')}</th><th scope="col">{t('stats_col_sent')}</th><th scope="col">{t('stats_col_arrived')}</th><th scope="col">{t('stats_col_received')}</th><th scope="col">{t('stats_col_amb')}</th></tr></thead>
          <tbody>
            {f.weeks.map((r) => (
              <tr key={r.week}><td>{weekLabel(r.week)}</td><td>{c(r.sent)}</td><td>{c(r.arrived)}</td><td>{c(r.received)}</td><td>{c(r.ambRequests)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Bed manager (E10-10): one stepper for free beds, the total behind a small field. */
function BedManager({ fac, deps }: { fac: MyFacility; deps: FacilityDeps }) {
  const [total, setTotal] = useState(fac.beds?.total ?? 0);
  const [free, setFree] = useState(fac.beds?.free ?? 0);
  const [at, setAt] = useState(fac.beds?.updatedAt ?? null);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  const h = hoursSince(at, new Date());
  async function save() {
    setState('busy');
    const b = await deps.saveBeds(fac.id, total, Math.min(free, total));
    if (b) { setTotal(b.total); setFree(b.free); setAt(b.updatedAt); setState('saved'); } else setState('failed');
  }
  const low = total > 0 && free <= LOW_BEDS;
  return (
    <section className="cloud stack" aria-labelledby="beds-h" style={{ gap: 14 }}>
      <span className="row"><h2 className="t-title" id="beds-h">{t('beds_title')}</h2><span className="t-small">{h === null ? t('beds_not_updated') : t('beds_updated_ago', { h })}</span></span>
      {total > 0 && <Stepper value={free} max={total} label={t('beds_free_n', { n: free })} onChange={(n) => { setFree(n); setState('idle'); }} />}
      {low && <Notice tone="danger">{t('beds_low_note', { max: LOW_BEDS })}</Notice>}
      <label className="field">{t('beds_total_label')}
        <input className="input num" type="number" inputMode="numeric" min={0} max={5000} value={total}
          onChange={(e) => { const n = Math.max(0, Math.min(5000, Math.floor(Number(e.target.value) || 0))); setTotal(n); setFree((f) => Math.min(f, n)); setState('idle'); }} />
        {total === 0 && <span className="hint">{t('beds_none_note')}</span>}
      </label>
      <button className="btn btn-primary btn-full" type="button" disabled={state === 'busy'} onClick={() => void save()}>{t('beds_save')}</button>
      {state === 'saved' && <p className="t-small" role="status" style={{ color: 'var(--ink)' }}>{t('beds_saved')}</p>}
      {state === 'failed' && <Notice tone="danger" role="alert">{t('beds_save_failed')}</Notice>}
    </section>
  );
}

export function Facility({ deps, dock }: { deps: FacilityDeps; onBack?: () => void; dock?: React.ReactNode }) {
  const [role, setRole] = useState<string | null | 'loading'>('loading');
  const [fac, setFac] = useState<MyFacility | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [save, setSave] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  const [rows, setRows] = useState<FacilityStats[] | null | 'loading'>('loading');

  useEffect(() => {
    void deps.role().then(async (r) => {
      setRole(r);
      if (r === 'admin') {
        const f = await deps.myFacility();
        setFac(f);
        if (f) { setServices(f.services); setPhone(f.phone); }
      }
      if (r === 'admin' || r === 'maintainer') setRows(await deps.stats(WEEKS));
    });
  }, [deps]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fac) return;
    setSave('busy');
    const next = await deps.saveServices(fac.id, services, phone.trim());
    if (next) { setFac(next); setSave('saved'); } else setSave('failed');
  }

  const title = fac?.name ?? t('facility_header');
  const beds = fac ? <BedManager key={fac.id} fac={fac} deps={deps} /> : null;
  if (role === 'loading') return <main className="screen"><TopBar title={t('facility_header')} big /><div className="body"><p className="t-small" role="status">{t('inbox_loading')}</p></div>{dock}</main>;
  if (role !== 'admin' && role !== 'maintainer') {
    return <main className="screen"><TopBar title={t('facility_header')} big /><div className="body"><Notice tone="danger" role="alert">{t('facility_admins_only')}</Notice></div>{dock}</main>;
  }
  const confirmed = daysAgo(fac?.servicesConfirmedAt ?? null);
  return (
    <main className="screen">
      <TopBar title={title} big />
      <div className="body has-dock pane">
        <div className="wide">
          {fac && (
            <form className="stack sticky" style={{ gap: 20 }} onSubmit={(e) => void onSave(e)}>
              {(confirmed === null || confirmed > 90)
                ? <Notice tone="warn">{confirmed === null ? t('facility_never_confirmed') : t('facility_last_checked', { days: confirmed })}</Notice>
                : <p className="t-small">{t('facility_last_checked', { days: confirmed })}</p>}
              {beds}
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="t-title" style={{ marginBottom: 6 }}>{t('facility_services_today')}</legend>
                {SERVICE_TAGS.map((x) => (
                  <label className="toggle" key={x}>
                    {t(`service_${x}` as StringKey).replace(/^./, (m) => m.toUpperCase())}
                    <input type="checkbox" role="switch" checked={services.includes(x)}
                      onChange={(e) => { setSave('idle'); setServices((v) => (e.target.checked ? [...v, x] : v.filter((y) => y !== x))); }} />
                  </label>
                ))}
              </fieldset>
              <label className="field">{t('facility_phone')}
                <input className="input num" value={phone} onChange={(e) => { setSave('idle'); setPhone(e.target.value); }} inputMode="tel" maxLength={32} />
              </label>
              <button className="btn btn-primary btn-full" type="submit" disabled={save === 'busy'}>{t('facility_save')}</button>
              {save === 'saved' && <p className="t-small" role="status" style={{ color: 'var(--ink)' }}>{t('facility_saved')}</p>}
              {save === 'failed' && <Notice tone="danger" role="alert">{t('facility_save_failed')}</Notice>}
            </form>
          )}
          <section className="stack" aria-labelledby="nums">
            <h2 className="t-title" id="nums">{t('stats_title', { weeks: WEEKS })}</h2>
            <p className="t-small">{t('stats_note')}</p>
            {rows === 'loading' && <p className="t-small" role="status">{t('inbox_loading')}</p>}
            {rows === null && <Empty tone="problem" role="alert" icon={<WifiOff size={26} />} title={t('stats_offline_title')} body={t('stats_offline')} />}
            {Array.isArray(rows) && rows.length === 0 && <Empty icon={<Chart size={26} />} title={t('stats_empty_title')} body={t('stats_empty')} />}
            {Array.isArray(rows) && rows.map((f) => <Numbers key={f.facilityId} f={f} />)}
          </section>
        </div>
      </div>
      {dock}
    </main>
  );
}
