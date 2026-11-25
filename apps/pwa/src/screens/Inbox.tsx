// Referrals (E10-04, E10-05; ADR-22, ADR-28). Received: look up a code, open a referral,
// mark arrival, record the confirmation test outcome. Sent: follow up, see outcomes.
// The receiving facility records a laboratory or clinician result, never an AI result.
import { useCallback, useEffect, useState } from 'react';
import { formatCode } from '../lib/referral/api';
import { nextActions, notArrived, OUTCOMES, type InboxDeps, type Outcome, type ReferralDetail, type ReferralSummary } from '../lib/referral/inbox';
import { t, type StringKey } from '../strings';
import { Back } from '../ui/icons';

type Tab = 'received' | 'sent';

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
};
const pretty = (key: string) => key.replace(/_/g, ' ');

function Bar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="bar">
      <button className="btn btn-round" type="button" aria-label={t('back')} onClick={onBack}><Back /></button>
      <span className="bar-title">{title}</span>
    </header>
  );
}

function Detail({ d, ownFacility, deps, onBack, onChange }: {
  d: ReferralDetail; ownFacility: 'sender' | 'receiver'; deps: InboxDeps; onBack: () => void; onChange: (d: ReferralDetail) => void;
}) {
  const r = d.referral;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [askOutcome, setAskOutcome] = useState(false);
  const actions = ownFacility === 'receiver' ? nextActions(r.status) : [];

  async function act(status: 'arrived' | 'tested' | 'closed', outcome?: Outcome, note?: string) {
    setBusy(true);
    setFailed(false);
    const next = await deps.advance(r.id, status, outcome, note);
    setBusy(false);
    setAskOutcome(false);
    if (next) onChange(next); else setFailed(true);
  }

  return (
    <main className="screen">
      <Bar title={t('referral_detail_header')} onBack={onBack} />
      <section className="panel panel-big">
        <p className="slip-code num">{formatCode(r.code, r.initials)}</p>
        <p className="lead strong">{t(`status_${r.status}` as StringKey)}</p>
        {r.outcome && <p className="lead">{t(`outcome_${r.outcome}` as StringKey)}</p>}
      </section>
      <dl className="kv">
        <div><dt>{t('detail_from')}</dt><dd>{r.fromName}</dd></div>
        <div><dt>{t('detail_to')}</dt><dd>{r.toName}</dd></div>
        <div><dt>{t('detail_sent')}</dt><dd>{day(r.createdAt)}</dd></div>
        {r.urgency && <div><dt>{t('slip_when')}</dt><dd>{t(`urgency_${r.urgency}` as StringKey)}</dd></div>}
        {d.results.map((x) => (
          <div key={x.createdAt}><dt>{t('condition_tb')}</dt><dd>{t(`zone_${x.zone}` as StringKey)}</dd></div>
        ))}
        {d.ageBand && <div><dt>{t('detail_age')}</dt><dd>{d.ageBand}</dd></div>}
        <div><dt>{t('detail_symptoms')}</dt><dd>{d.symptoms.length ? d.symptoms.map(pretty).join(', ') : t('detail_none_recorded')}</dd></div>
      </dl>
      <p className="small">{t('detail_screening_note')}</p>

      <ol className="steps" aria-label={t('detail_history')}>
        {d.events.map((e, i) => (
          <li key={`${e.status}-${i}`}>
            <span className="step-name"><span className="dot" aria-hidden="true" />{t(`status_${e.status}` as StringKey)}</span>
            <span className="small">{day(e.at)}{e.note ? ` · ${e.note}` : ''}</span>
          </li>
        ))}
      </ol>

      {(() => {
        // Each side can call the other facility.
        const phone = ownFacility === 'sender' ? r.toPhone : r.fromPhone;
        return phone ? <a className="link" href={`tel:${phone}`}>{t('call_facility', { phone })}</a> : null;
      })()}
      {failed && <p className="alert" role="alert">{t('advance_failed')}</p>}
      <div className="spacer" />
      <p className="lead strong center">{t('reminder')}</p>

      {askOutcome ? (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lead strong" style={{ marginBottom: 10 }}>{t('outcome_question')}</legend>
          {OUTCOMES.map((o) => (
            <button key={o} className="btn btn-secondary" type="button" disabled={busy} onClick={() => void act('tested', o)}>
              {t(`outcome_${o}` as StringKey)}
            </button>
          ))}
          <button className="link" type="button" onClick={() => setAskOutcome(false)}>{t('cancel')}</button>
        </fieldset>
      ) : (
        <div className="stack">
          {actions.includes('arrived') && (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void act('arrived')}>{t('action_arrived')}</button>
          )}
          {actions.includes('tested') && (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => setAskOutcome(true)}>{t('action_tested')}</button>
          )}
          {actions.includes('closed') && (
            <button className="btn btn-secondary" type="button" disabled={busy}
              onClick={() => void act('closed', undefined, r.status === 'created' || r.status === 'seen' ? t('note_did_not_arrive') : '')}>
              {r.status === 'created' || r.status === 'seen' ? t('action_close_not_arrived') : t('action_close')}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

export function Inbox({ deps, onBack }: { deps: InboxDeps; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('received');
  const [rows, setRows] = useState<ReferralSummary[] | null | 'loading'>('loading');
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<'idle' | 'busy' | 'missing' | 'locked'>('idle');
  const [open, setOpen] = useState<{ d: ReferralDetail; as: 'sender' | 'receiver' } | null>(null);
  const now = new Date();

  const load = useCallback((which: Tab) => {
    setRows('loading');
    void deps.list(which).then(setRows);
  }, [deps]);
  useEffect(() => { load(tab); }, [tab, load]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLookup('busy');
    const d = await deps.lookup(code);
    if (d === 'locked') return setLookup('locked');
    if (!d) return setLookup('missing');
    setLookup('idle');
    setCode('');
    setOpen({ d, as: 'receiver' });
  }

  async function openRow(r: ReferralSummary) {
    const d = await deps.open(r.id);
    if (d) setOpen({ d, as: tab === 'received' ? 'receiver' : 'sender' });
  }

  if (open) {
    return (
      <Detail
        d={open.d}
        ownFacility={open.as}
        deps={deps}
        onBack={() => { setOpen(null); load(tab); }}
        onChange={(d) => setOpen({ d, as: open.as })}
      />
    );
  }

  return (
    <main className="screen">
      <Bar title={t('inbox_header')} onBack={onBack} />
      <fieldset className="choices" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <legend className="sr">{t('inbox_header')}</legend>
        {(['received', 'sent'] as const).map((x) => (
          <label className="choice" key={x}>
            <input type="radio" name="tab" checked={tab === x} onChange={() => setTab(x)} />
            <span>{t(`tab_${x}` as StringKey)}</span>
          </label>
        ))}
      </fieldset>

      {tab === 'received' && (
        <form className="stack" onSubmit={(e) => void find(e)}>
          <label className="field">
            {t('lookup_label')}
            <input value={code} onChange={(e) => { setCode(e.target.value); setLookup('idle'); }} autoComplete="off"
              autoCapitalize="characters" spellCheck={false} maxLength={12} placeholder="KAM 7QM4X" />
          </label>
          {lookup === 'missing' && <p className="alert" role="alert">{t('lookup_missing')}</p>}
          {lookup === 'locked' && <p className="alert" role="alert">{t('lookup_locked')}</p>}
          <button className="btn btn-dark" type="submit" disabled={!code.trim() || lookup === 'busy'}>
            {lookup === 'busy' ? t('lookup_busy') : t('lookup_button')}
          </button>
        </form>
      )}

      {rows === 'loading' && <p className="muted" role="status">{t('inbox_loading')}</p>}
      {rows === null && <p className="alert" role="alert">{t('inbox_offline')}</p>}
      {Array.isArray(rows) && rows.length === 0 && <p className="muted">{t(tab === 'received' ? 'inbox_empty_received' : 'inbox_empty_sent')}</p>}
      {Array.isArray(rows) && rows.length > 0 && (
        <ul className="facs" style={{ listStyle: 'none' }}>
          {rows.map((r) => {
            const late = tab === 'sent' && notArrived(r, now);
            return (
              <li key={r.id}>
                <button className="fac" type="button" style={{ width: '100%', textAlign: 'left', font: 'inherit' }} onClick={() => void openRow(r)}>
                  <span className="fac-head">
                    <span className="fac-name num">{formatCode(r.code, r.initials)}</span>
                    <span className="small">{day(r.createdAt)}</span>
                  </span>
                  <span className="small">{tab === 'received' ? t('row_from', { name: r.fromName }) : t('row_to', { name: r.toName })}</span>
                  <span className="small strong">
                    {t(`status_${r.status}` as StringKey)}
                    {r.outcome ? ` · ${t(`outcome_${r.outcome}` as StringKey)}` : ''}
                  </span>
                  {late && <span className="small strong">{t('row_not_arrived')}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
