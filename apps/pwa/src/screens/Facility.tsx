// Facility page (E10-09, adds to E10-02; ADR-28 section 6). For admins:
//  - Services: the facility keeps its own service list up to date (hazard H16). Saving,
//    even with no change, records today as "last confirmed".
//  - Referral numbers: weekly counts, no patient identifiers. A maintainer sees all facilities.
import { useEffect, useState } from 'react';
import { SERVICE_TAGS } from '../lib/referral/rules';
import { share, type Count, type FacilityDeps, type FacilityStats, type MyFacility } from '../lib/referral/stats';
import { t, type StringKey } from '../strings';
import { Back } from '../ui/icons';

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
      <h2>{f.facilityName}</h2>
      <dl className="kv">
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

export function Facility({ deps, onBack }: { deps: FacilityDeps; onBack: () => void }) {
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

  const bar = (
    <header className="bar">
      <button className="btn btn-round" type="button" aria-label={t('back')} onClick={onBack}><Back /></button>
      <span className="bar-title">{t('facility_header')}</span>
    </header>
  );
  if (role === 'loading') return <main className="screen">{bar}<p className="muted" role="status">{t('inbox_loading')}</p></main>;
  if (role !== 'admin' && role !== 'maintainer') {
    return <main className="screen">{bar}<p className="alert" role="alert">{t('facility_admins_only')}</p></main>;
  }
  const confirmed = daysAgo(fac?.servicesConfirmedAt ?? null);
  return (
    <main className="screen">
      {bar}
      {fac && (
        <form className="panel" onSubmit={(e) => void onSave(e)}>
          <h1 className="h1">{fac.name}</h1>
          <p className={confirmed === null || confirmed > 90 ? 'alert' : 'small'}>
            {confirmed === null ? t('facility_never_confirmed') : t('facility_confirmed_ago', { days: confirmed })}
          </p>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="lead strong" style={{ marginBottom: 8 }}>{t('facility_services_q')}</legend>
            {SERVICE_TAGS.map((s) => (
              <label className="consent" key={s}>
                <input type="checkbox" checked={services.includes(s)}
                  onChange={(e) => { setSave('idle'); setServices((v) => (e.target.checked ? [...v, s] : v.filter((x) => x !== s))); }} />
                <span>{t(`service_${s}` as StringKey)}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            {t('facility_phone')}
            <input value={phone} onChange={(e) => { setSave('idle'); setPhone(e.target.value); }} inputMode="tel" maxLength={32} />
          </label>
          {save === 'saved' && <p className="small" role="status">{t('facility_saved')}</p>}
          {save === 'failed' && <p className="alert" role="alert">{t('facility_save_failed')}</p>}
          <button className="btn btn-dark" type="submit" disabled={save === 'busy'}>{t('facility_save')}</button>
        </form>
      )}

      <div className="stack">
        <h2 className="lead strong">{t('stats_title', { weeks: WEEKS })}</h2>
        <p className="small">{t('stats_note')}</p>
        {rows === 'loading' && <p className="muted" role="status">{t('inbox_loading')}</p>}
        {rows === null && <p className="alert" role="alert">{t('inbox_offline')}</p>}
        {Array.isArray(rows) && rows.map((f) => <Numbers key={f.facilityId} f={f} />)}
      </div>
    </main>
  );
}
