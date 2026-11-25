// Referrals (E10-04, E10-05; ADR-22, ADR-28). Received: look up a code, open a referral,
// mark arrival, record the confirmation test outcome. Sent: follow up, see outcomes.
// The receiving facility records a laboratory or clinician result, never an AI result.
import { useCallback, useEffect, useState } from 'react';
import { formatCode } from '../lib/referral/api';
import { nextActions, notArrived, OUTCOMES, type InboxDeps, type KeyStatus, type OpenedImage, type Outcome, type ReferralDetail, type ReferralSummary } from '../lib/referral/inbox';
import { passphraseProblem } from '../lib/referral/crypto';
import { t, type StringKey } from '../strings';
import { Back } from '../ui/icons';
import { AmbulancePanel, AmbulanceQueue } from './Ambulance';
import type { AmbulanceDeps } from '../lib/referral/ambulance';

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

function Detail({ d, ownFacility, deps, ambulance, onBack, onChange }: {
  d: ReferralDetail; ownFacility: 'sender' | 'receiver'; deps: InboxDeps; ambulance: AmbulanceDeps | null; onBack: () => void; onChange: (d: ReferralDetail) => void;
}) {
  const r = d.referral;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [askOutcome, setAskOutcome] = useState(false);
  const [img, setImg] = useState<OpenedImage | 'loading' | null>(null);
  const [pass, setPass] = useState('');
  const [wrongPass, setWrongPass] = useState(false);
  async function showImage() {
    setImg('loading');
    setImg(await deps.openImage(r.id));
  }
  async function unlockAndShow(e: React.FormEvent) {
    e.preventDefault();
    setImg('loading');
    const ok = await deps.unlock(pass);
    setPass('');
    setWrongPass(!ok);
    if (ok) await showImage(); else setImg({ kind: 'locked' });
  }
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
        {r.outcome === 'not_confirmed' && ownFacility === 'sender' && <p className="small strong">{t('outcome_not_confirmed_note')}</p>}
      </section>
      <dl className="kv">
        <div><dt>{t('detail_from')}</dt><dd>{r.fromName}</dd></div>
        <div><dt>{t('detail_to')}</dt><dd>{r.toName}</dd></div>
        <div><dt>{t('detail_sent')}</dt><dd>{day(r.createdAt)}</dd></div>
        {r.urgency && <div><dt>{t('slip_when')}</dt><dd>{t(`urgency_${r.urgency}` as StringKey)}</dd></div>}
        {d.results.map((x) => (
          <div key={x.createdAt}><dt>{t('condition_tb')}</dt><dd>{t(`zone_${x.zone}` as StringKey)}</dd></div>
        ))}
        {d.results.length > 0 && (
          <div><dt>{t('detail_versions')}</dt><dd className="small">{d.results[d.results.length - 1].modelVersion} · {d.results[d.results.length - 1].thresholdsVersion}</dd></div>
        )}
        {d.ageBand && <div><dt>{t('detail_age')}</dt><dd>{d.ageBand}</dd></div>}
        <div><dt>{t('detail_symptoms')}</dt><dd>{d.symptoms.length ? d.symptoms.map(pretty).join(', ') : t('detail_none_recorded')}</dd></div>
      </dl>
      <p className="small">{t('detail_screening_note')}</p>
      {!r.imageShared ? (
        <p className="small">{t('image_not_shared')}</p>
      ) : img && img !== 'loading' && img.kind === 'ok' ? (
        <div className="stack">
          <img className="xray-shared" src={img.image} alt={t('image_alt')} />
          {img.heatmap && (
            <figure className="stack" style={{ margin: 0 }}>
              <img className="xray-shared" src={img.heatmap} alt={t('heatmap_alt')} />
              <figcaption className="small">{t('heatmap_caption')}</figcaption>
            </figure>
          )}
        </div>
      ) : img && img !== 'loading' && img.kind === 'locked' ? (
        <form className="stack" onSubmit={(e) => void unlockAndShow(e)}>
          <label className="field">
            {t('unlock_label')}
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
            <span className="small">{t('unlock_hint')}</span>
          </label>
          {wrongPass && <p className="alert" role="alert">{t('unlock_wrong')}</p>}
          <button className="btn btn-dark" type="submit" disabled={!pass}>{t('unlock_button')}</button>
        </form>
      ) : img && img !== 'loading' && img.kind === 'no_key' ? (
        <p className="small" role="status">{t('image_no_key')}</p>
      ) : (
        <button className="btn btn-secondary" type="button" disabled={img === 'loading'} onClick={() => void showImage()}>
          {img === 'loading' ? t('image_loading') : img?.kind === 'failed' ? t('image_load_failed') : t('image_show')}
        </button>
      )}

      <ol className="steps" aria-label={t('detail_history')}>
        {d.events.map((e, i) => (
          <li key={`${e.status}-${i}`}>
            <span className="step-name"><span className="dot" aria-hidden="true" />{t(`status_${e.status}` as StringKey)}</span>
            <span className="small">{day(e.at)}{e.note ? ` · ${e.note}` : ''}</span>
          </li>
        ))}
      </ol>

      {ambulance && ownFacility === 'sender' && r.status !== 'closed' ? (
        <AmbulancePanel referralId={r.id} toName={r.toName} toPhone={r.toPhone} deps={ambulance} />
      ) : (() => {
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

export function Inbox({ deps, ambulance, onBack }: { deps: InboxDeps; ambulance: AmbulanceDeps | null; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('received');
  const [rows, setRows] = useState<ReferralSummary[] | null | 'loading'>('loading');
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<'idle' | 'busy' | 'missing' | 'locked'>('idle');
  const [open, setOpen] = useState<{ d: ReferralDetail; as: 'sender' | 'receiver' } | null>(null);
  const now = new Date();
  const [keys, setKeys] = useState<KeyStatus | null>(null);
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [setupState, setSetupState] = useState<'idle' | 'busy' | 'failed'>('idle');
  useEffect(() => { void deps.keyStatus().then(setKeys); }, [deps]);

  async function setUp(e: React.FormEvent) {
    e.preventDefault();
    if (passphraseProblem(newPass) || newPass !== newPass2) return;
    setSetupState('busy');
    const ok = await deps.setUpKey(newPass);
    setNewPass('');
    setNewPass2('');
    setSetupState(ok ? 'idle' : 'failed');
    if (ok) setKeys(await deps.keyStatus());
  }

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
        ambulance={ambulance}
        onBack={() => { setOpen(null); load(tab); }}
        onChange={(d) => setOpen({ d, as: open.as })}
      />
    );
  }

  return (
    <main className="screen">
      <Bar title={t('inbox_header')} onBack={onBack} />
      {ambulance && <AmbulanceQueue deps={ambulance} />}
      <fieldset className="choices" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <legend className="sr">{t('inbox_header')}</legend>
        {(['received', 'sent'] as const).map((x) => (
          <label className="choice" key={x}>
            <input type="radio" name="tab" checked={tab === x} onChange={() => setTab(x)} />
            <span>{t(`tab_${x}` as StringKey)}</span>
          </label>
        ))}
      </fieldset>

      {keys && !keys.hasKey && (keys.canSetUp ? (
        <form className="panel" onSubmit={(e) => void setUp(e)}>
          <h2 className="lead strong">{t('setup_title')}</h2>
          <p className="small">{t('setup_body')}</p>
          <label className="field">{t('setup_pass')}
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="field">{t('setup_pass2')}
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} autoComplete="new-password" />
          </label>
          {newPass && passphraseProblem(newPass) && <p className="small">{t('setup_too_short')}</p>}
          {newPass2 && newPass !== newPass2 && <p className="small">{t('setup_mismatch')}</p>}
          {setupState === 'failed' && <p className="alert" role="alert">{t('setup_failed')}</p>}
          <button className="btn btn-dark" type="submit" disabled={setupState === 'busy' || !!passphraseProblem(newPass) || newPass !== newPass2}>
            {setupState === 'busy' ? t('setup_busy') : t('setup_button')}
          </button>
        </form>
      ) : (
        <p className="small">{t('setup_ask_admin')}</p>
      ))}

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
