// Referrals (E10-04, E10-05; ADR-22, ADR-28). Received: look up a code, open a referral,
// mark arrival, record the confirmation test outcome. Sent: follow up, see outcomes.
// The receiving facility records a laboratory or clinician result, never an AI result.
import { useCallback, useEffect, useState } from 'react';
import { formatCode } from '../lib/referral/api';
import { nextActions, notArrived, OUTCOMES, type InboxDeps, type KeyStatus, type OpenedImage, type Outcome, type ReferralDetail, type ReferralSummary } from '../lib/referral/inbox';
import { passphraseProblem } from '../lib/referral/crypto';
import { t, type StringKey } from '../strings';
import { ImageIcon, Lock, Phone } from '../ui/icons';
import { Facts, Foot, Notice, TopBar, ZoneRow } from '../ui/kit';
import { AmbulancePanel, AmbulanceQueue } from './Ambulance';
import type { AmbulanceDeps } from '../lib/referral/ambulance';

type Tab = 'received' | 'sent';

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
};
const pretty = (key: string) => key.replace(/_/g, ' ');

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

  const [confirmClose, setConfirmClose] = useState(false);
  const phone = ownFacility === 'sender' ? r.toPhone : r.fromPhone;
  const notArrivedYet = r.status === 'created' || r.status === 'seen';
  const latest = d.results[d.results.length - 1];

  return (
    <main className="screen">
      <TopBar title={ownFacility === 'sender' ? t('sent_referral') : t('referral_detail_header')} onBack={onBack} />
      <div className="body has-foot pane">
        <div className="stack-tight">
          <p className="code-xl">{formatCode(r.code, r.initials)}</p>
          <p className="t-small">{ownFacility === 'sender' ? t('row_to', { name: r.toName }) : t('row_from', { name: r.fromName })}, {day(r.createdAt)}</p>
        </div>
        {r.outcome && (
          <section className="card" aria-labelledby="oc">
            <h2 className="t-title" id="oc">{t(`outcome_${r.outcome}` as StringKey)}</h2>
            {r.outcome === 'not_confirmed' && ownFacility === 'sender' && <p className="t-strong">{t('outcome_not_confirmed_note')}</p>}
          </section>
        )}
        {latest && <ZoneRow zone={latest.zone === 'retake' ? 'unsure' : latest.zone} word={t(`zone_${latest.zone}` as StringKey)} sub={t('needs_confirmation')} />}
        <Facts rows={[
          ...(d.ageBand ? [[t('detail_age'), d.ageBand] as [string, string]] : []),
          [t('detail_symptoms'), d.symptoms.length ? d.symptoms.map(pretty).join(', ') : t('detail_none_recorded')],
          ...(r.urgency ? [[t('slip_when'), t(`urgency_${r.urgency}` as StringKey)] as [string, string]] : []),
        ]} />
        {latest && <p className="t-cap">{t('model_line', { model: latest.modelVersion, thresholds: latest.thresholdsVersion })}</p>}

        {!r.imageShared ? (
          <p className="t-small">{t('image_not_shared')}</p>
        ) : img && img !== 'loading' && img.kind === 'ok' ? (
          <ImageViewer image={img.image} heatmap={img.heatmap} />
        ) : img && img !== 'loading' && img.kind === 'locked' ? (
          <form className="cloud" onSubmit={(e) => void unlockAndShow(e)}>
            <h2 className="t-sub"><Lock size={18} /> {t('unlock_title')}</h2>
            <label className="field">{t('unlock_label')}
              <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" aria-invalid={wrongPass} />
              <span className="hint">{t('unlock_hint')}</span>
            </label>
            {wrongPass && <p className="error" role="alert">{t('unlock_wrong')}</p>}
            <button className="btn btn-primary btn-full" type="submit" disabled={!pass}>{t('unlock_button')}</button>
          </form>
        ) : img && img !== 'loading' && img.kind === 'no_key' ? (
          <p className="t-small" role="status">{t('image_no_key')}</p>
        ) : (
          <button className="btn btn-ghost btn-full" type="button" disabled={img === 'loading'} onClick={() => void showImage()}>
            <ImageIcon color="#2597d0" />{img === 'loading' ? t('image_loading') : img?.kind === 'failed' ? t('image_load_failed') : t('image_show')}
          </button>
        )}

        <section className="stack" aria-labelledby="hist">
          <h2 className="t-title" id="hist">{t('detail_history')}</h2>
          <ol className="tl">
            {d.events.map((e, i) => <li key={`${e.status}-${i}`}>{t(`status_${e.status}` as StringKey)}<span className="when">{day(e.at)}{e.note ? `, ${e.note}` : ''}</span></li>)}
            {actions.length > 0 && <li className="next">{notArrivedYet ? t('waiting_for_person') : t('record_test_next')}</li>}
          </ol>
        </section>

        {ambulance && ownFacility === 'sender' && r.status !== 'closed'
          ? <AmbulancePanel referralId={r.id} toName={r.toName} toPhone={r.toPhone} deps={ambulance} />
          : phone && <a className="link" href={`tel:${phone}`}><Phone size={16} />{t('call_facility', { phone })}</a>}

        {askOutcome && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="t-title" style={{ marginBottom: 10 }}>{t('outcome_question')}</legend>
            {OUTCOMES.map((o) => (
              <button key={o} className="choice" type="button" disabled={busy} onClick={() => void act('tested', o)} style={{ border: 0, textAlign: 'left' }}>{t(`outcome_${o}` as StringKey)}</button>
            ))}
            <button className="link" type="button" onClick={() => setAskOutcome(false)}>{t('cancel')}</button>
          </fieldset>
        )}
        {failed && <Notice tone="danger" role="alert">{t('advance_failed')}</Notice>}
      </div>

      {actions.length > 0 && !askOutcome && (
        <Foot>
          {actions.includes('arrived') && <button className="btn btn-primary btn-lg btn-full" type="button" disabled={busy} onClick={() => void act('arrived')}>{t('action_arrived')}</button>}
          {actions.includes('tested') && <button className="btn btn-primary btn-lg btn-full" type="button" disabled={busy} onClick={() => setAskOutcome(true)}>{t('action_tested')}</button>}
          {actions.includes('closed') && (confirmClose ? (
            <>
              <p className="t-small" role="alert" style={{ textAlign: 'center', color: 'var(--ink)', fontWeight: 500 }}>{t('close_confirm')}</p>
              <div className="grid2">
                <button className="btn btn-ghost" type="button" onClick={() => setConfirmClose(false)} style={{ background: '#fff' }}>{t('keep_open')}</button>
                <button className="btn btn-primary" type="button" disabled={busy}
                  onClick={() => { setConfirmClose(false); void act('closed', undefined, notArrivedYet ? t('note_did_not_arrive') : ''); }}>{t('yes_close')}</button>
              </div>
            </>
          ) : (
            <button className="btn btn-ghost btn-full" type="button" disabled={busy} onClick={() => setConfirmClose(true)} style={{ background: '#fff' }}>
              {notArrivedYet ? t('action_close_not_arrived') : t('action_close')}
            </button>
          ))}
        </Foot>
      )}
    </main>
  );
}

/** Shared X-ray and heatmap, side by side on wide screens, toggled on a phone. */
function ImageViewer({ image, heatmap }: { image: string; heatmap: string | null }) {
  const [heat, setHeat] = useState(Boolean(heatmap));
  return (
    <figure className="stack" style={{ margin: 0 }}>
      {heatmap && (
        <div className="seg" role="group" aria-label={t('image_view')}>
          <button type="button" aria-pressed={!heat} onClick={() => setHeat(false)}>{t('view_xray')}</button>
          <button type="button" aria-pressed={heat} onClick={() => setHeat(true)}>{t('view_heatmap')}</button>
        </div>
      )}
      <div className="film" style={{ aspectRatio: '4 / 5' }}>
        <img src={heat && heatmap ? heatmap : image} alt={heat && heatmap ? t('heatmap_alt') : t('image_alt')} />
      </div>
      <figcaption className="t-small">{heat && heatmap ? t('heatmap_caption') : t('xray_caption')}</figcaption>
      <p className="t-small"><Lock size={14} color="#2597d0" /> {t('viewing_logged')}</p>
    </figure>
  );
}

export function Inbox({ deps, ambulance, onBack, dock }: { deps: InboxDeps; ambulance: AmbulanceDeps | null; onBack: () => void; dock?: React.ReactNode }) {
  void onBack;
  const [showPass, setShowPass] = useState(false);
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
      <TopBar title={t('inbox_header')} big />
      <div className="body has-dock pane">
        {ambulance && <AmbulanceQueue deps={ambulance} />}
        <div className="seg" role="group" aria-label={t('inbox_header')}>
          {(['received', 'sent'] as const).map((x) => (
            <button key={x} type="button" aria-pressed={tab === x} onClick={() => setTab(x)}>{t(`tab_${x}` as StringKey)}</button>
          ))}
        </div>

        {tab === 'received' && (
          <form style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }} onSubmit={(e) => void find(e)}>
            <label className="field" style={{ flex: 1 }}>{t('lookup_label')}
              <input className="input code" value={code} onChange={(e) => { setCode(e.target.value); setLookup('idle'); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} placeholder="KAM 7QM4X" aria-invalid={lookup === 'missing'} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={!code.trim() || lookup === 'busy'}>{lookup === 'busy' ? t('lookup_busy') : t('lookup_button_short')}</button>
          </form>
        )}
        {lookup === 'missing' && <p className="error" role="alert">{t('lookup_missing')}</p>}
        {lookup === 'locked' && <p className="error" role="alert">{t('lookup_locked')}</p>}

        {rows === 'loading' && <p className="t-small" role="status">{t('inbox_loading')}</p>}
        {rows === null && <Notice tone="danger" role="alert">{t('inbox_offline')}</Notice>}
        {Array.isArray(rows) && rows.length === 0 && <p className="t-small">{t(tab === 'received' ? 'inbox_empty_received' : 'inbox_empty_sent')}</p>}
        {Array.isArray(rows) && rows.length > 0 && (
          <ul className="list" aria-label={t(`tab_${tab}` as StringKey)}>
            {rows.map((r) => {
              const late = tab === 'sent' && notArrived(r, now);
              return (
                <li key={r.id}>
                  <button className="item" type="button" onClick={() => void openRow(r)}>
                    <span className="row"><span className={`code${r.status === 'created' && tab === 'received' ? ' t-strong' : ''}`}>{formatCode(r.code, r.initials)}</span><span className="t-small num">{day(r.createdAt)}</span></span>
                    <span className="t-small">{tab === 'received' ? r.fromName : r.toName}</span>
                    <span className="t-small" style={{ color: 'var(--ink)', fontWeight: 500 }}>
                      {t(`status_${r.status}` as StringKey)}{r.outcome ? `, ${t(`outcome_${r.outcome}` as StringKey).toLowerCase()}` : ''}
                    </span>
                    {late && <span className="meta meta-warn">{t('row_not_arrived')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {keys && !keys.hasKey && (keys.canSetUp ? (
          <form className="cloud" onSubmit={(e) => void setUp(e)}>
            <h2 className="t-title">{t('setup_title')}</h2>
            <p className="t-small">{t('setup_body')}</p>
            <label className="field"><span className="field-row">{t('setup_pass')}<button className="link" type="button" onClick={() => setShowPass(!showPass)}>{showPass ? t('hide') : t('show')}</button></span>
              <input className="input" type={showPass ? 'text' : 'password'} value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
              {newPass && passphraseProblem(newPass) && <span className="hint">{t('setup_too_short')}</span>}
            </label>
            <label className="field">{t('setup_pass2')}
              <input className="input" type={showPass ? 'text' : 'password'} value={newPass2} onChange={(e) => setNewPass2(e.target.value)} autoComplete="new-password" aria-invalid={Boolean(newPass2) && newPass !== newPass2} />
              {newPass2 && newPass !== newPass2 && <span className="error" role="alert">{t('setup_mismatch')}</span>}
            </label>
            <Notice tone="warn">{t('setup_lost')}</Notice>
            {setupState === 'failed' && <p className="error" role="alert">{t('setup_failed')}</p>}
            <button className="btn btn-primary btn-full" type="submit" disabled={setupState === 'busy' || !!passphraseProblem(newPass) || newPass !== newPass2}>
              {setupState === 'busy' ? t('setup_busy') : t('setup_button')}
            </button>
          </form>
        ) : <p className="t-small">{t('setup_ask_admin')}</p>)}
      </div>
      {dock}
    </main>
  );
}
