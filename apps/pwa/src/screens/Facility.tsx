// Facility page (E10-09, adds to E10-02; ADR-28 section 6). For admins:
//  - Services: the facility keeps its own service list up to date (hazard H16). Saving,
//    even with no change, records today as "last confirmed".
//  - Referral numbers: weekly counts, no patient identifiers. A maintainer sees all facilities.
import { useEffect, useState } from 'react';
import { SERVICE_TAGS } from '../lib/referral/rules';
import { share, type Count, type FacilityDeps, type FacilityStats, type MyFacility } from '../lib/referral/stats';
import { t, type StringKey } from '../strings';
import { Notice, TopBar } from '../ui/kit';

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

export function Facility({ deps, dock }: { deps: FacilityDeps; onBack?: () => void; dock?: React.ReactNode }) {
  const [role, setRole] = useState<string | null | 'loading'>('loading');
  const [fac, setFac] = useState<MyFacility | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [save, setSave] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  const [rows, setRows] = useState<FacilityStats[] | null | 'loading'>('loading');
  const beds: React.ReactNode = null; // bed manager (beds phase)

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
            {rows === null && <Notice tone="danger" role="alert">{t('inbox_offline')}</Notice>}
            {Array.isArray(rows) && rows.map((f) => <Numbers key={f.facilityId} f={f} />)}
          </section>
        </div>
      </div>
      {dock}
    </main>
  );
}
