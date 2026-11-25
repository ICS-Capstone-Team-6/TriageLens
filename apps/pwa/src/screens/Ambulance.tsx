// Ambulance request UI (E10-08, ADR-28 section 5; H18, H19).
// Sender: call first, then optionally ask the receiving facility to send an ambulance.
// Receiver: open requests pinned on top of the Referrals page, answered there.
// The app never suggests an ambulance; the health worker decides and gives a reason.
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCode } from '../lib/referral/api';
import {
  ETAS, isOpen, minutesSince, newOpenIds, notSeenTooLong, notifyNewRequest, POLL_MS, REASONS, URGENT_REASONS,
  type AmbulanceDeps, type AmbulanceRequest, type Reason,
} from '../lib/referral/ambulance';
import { t, type StringKey } from '../strings';

function usePoll(fn: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    fn();
    const id = setInterval(fn, POLL_MS);
    const onFocus = () => fn();
    addEventListener('focus', onFocus);
    return () => { clearInterval(id); removeEventListener('focus', onFocus); };
  }, [fn, active]);
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function CallButton({ phone, name, primary }: { phone: string; name: string; primary?: boolean }) {
  if (!phone) return <p className="t-small">{t('amb_no_phone', { name })}</p>;
  return <a className={`btn ${primary ? 'btn-primary' : 'btn-ghost'}`} href={`tel:${phone}`}>{t('amb_call', { name })}</a>;
}

/** Sender side, on the slip and on a sent referral. */
export function AmbulancePanel({ referralId, toName, toPhone, deps }: { referralId: string; toName: string; toPhone: string; deps: AmbulanceDeps }) {
  const [req, setReq] = useState<AmbulanceRequest | null>(null);
  const [form, setForm] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'offline' | 'failed' | 'already_open'>('idle');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const now = useNow();

  const refresh = useCallback(() => {
    void deps.list('sent').then((rows) => {
      const mine = (rows ?? []).filter((a) => a.referralId === referralId);
      setReq(mine.find(isOpen) ?? mine[0] ?? null);
    });
  }, [deps, referralId]);
  usePoll(refresh, true);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reason || (reason === 'other' && !note.trim())) return;
    setState('sending');
    const res = await deps.request({ id: requestId, referralId, reason, note });
    if (res.kind === 'ok') {
      setReq(res.request);
      setForm(false);
      setState('idle');
    } else {
      setState(res.kind);
    }
  }

  async function cancel() {
    if (!req) return;
    const next = await deps.cancel(req.id);
    if (next) { setReq(next); setRequestId(crypto.randomUUID()); }
  }

  const open = req && isOpen(req);
  return (
    <section className="cloud" aria-labelledby="amb-h">
      <h2 className="t-title" id="amb-h">{t('amb_title')}</h2>
      <p className="t-small">{t('amb_emergency')}</p>
      {/* The call always comes first (H18). */}
      <CallButton phone={toPhone} name={toName} primary />

      {req && req.status !== 'cancelled' && (
        <div className="amb-status" role="status" aria-live="polite">
          <p className="t-strong">{t(`amb_status_${req.status}` as StringKey, { name: toName, eta: req.etaMinutes ?? '' })}</p>
          {req.status === 'cannot_send' && req.answerNote && <p className="t-small">{req.answerNote}</p>}
          {req.status === 'requested' && <p className="t-small">{t('amb_sent_ago', { m: minutesSince(req.createdAt, now) })}</p>}
          {notSeenTooLong(req, now) && <p className="notice notice-danger" role="alert">{t('amb_not_seen')}</p>}
          {open && <button className="link" type="button" onClick={() => void cancel()}>{t('amb_cancel')}</button>}
        </div>
      )}

      {!open && !form && (
        <button className="btn btn-ghost" type="button" onClick={() => { setForm(true); setState('idle'); }}>
          {t('amb_ask', { name: toName })}
        </button>
      )}

      {form && !open && (
        <form className="stack" onSubmit={(e) => void send(e)}>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="t-strong" style={{ marginBottom: 8 }}>{t('amb_reason_q')}</legend>
            {REASONS.map((r) => (
              <label className="choice" key={r}>
                <input type="radio" name="amb-reason" checked={reason === r} onChange={() => setReason(r)} />
                <span>{t(`amb_reason_${r}` as StringKey)}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            {reason === 'other' ? t('amb_note_required') : t('amb_note')}
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          {reason && URGENT_REASONS.includes(reason) && <p className="notice notice-danger" role="alert">{t('amb_urgent', { name: toName })}</p>}
          {state === 'offline' && <p className="notice notice-danger" role="alert">{t('amb_offline', { name: toName })}</p>}
          {state === 'failed' && <p className="notice notice-danger" role="alert">{t('amb_failed')}</p>}
          {state === 'already_open' && <p className="notice notice-danger" role="alert">{t('amb_already_open')}</p>}
          <button className="btn btn-primary" type="submit" disabled={!reason || (reason === 'other' && !note.trim()) || state === 'sending'}>
            {state === 'sending' ? t('amb_sending') : t('amb_send', { name: toName })}
          </button>
          <button className="link" type="button" onClick={() => setForm(false)}>{t('cancel')}</button>
        </form>
      )}
    </section>
  );
}

/** Receiver side: open requests, pinned on top of the Referrals page. */
export function AmbulanceQueue({ deps }: { deps: AmbulanceDeps }) {
  const [rows, setRows] = useState<AmbulanceRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [eta, setEta] = useState<Record<string, number | undefined>>({});
  const [why, setWhy] = useState<Record<string, string>>({});
  const [askWhy, setAskWhy] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);
  const now = useNow();

  const refresh = useCallback(() => {
    void deps.list('received').then((list) => {
      const open = (list ?? []).filter(isOpen);
      if (known.current) {
        const fresh = newOpenIds(known.current, open);
        if (fresh.length) void notifyNewRequest(t('amb_notify_title'), t('amb_notify_body', { n: fresh.length }));
      }
      known.current = new Set(open.map((a) => a.id));
      setRows(open);
    });
  }, [deps]);
  usePoll(refresh, true);

  async function answer(a: AmbulanceRequest, status: 'seen' | 'dispatched' | 'cannot_send') {
    setBusy(a.id);
    if (status === 'dispatched' && !eta[a.id]) return; // staff must choose a time; no default (safety review)
    await deps.answer(a.id, status, status === 'dispatched' ? eta[a.id] : undefined, status === 'cannot_send' ? why[a.id] : undefined);
    setBusy(null);
    setAskWhy(null);
    refresh();
  }

  const askPermission = typeof Notification !== 'undefined' && Notification.permission === 'default';
  if (rows.length === 0) {
    return askPermission ? (
      <button className="link" type="button" onClick={() => void Notification.requestPermission()}>{t('amb_allow_notifications')}</button>
    ) : null;
  }
  return (
    <section className="stack" aria-labelledby="ambq-h">
      <h2 className="t-title" id="ambq-h">{t('amb_queue_title', { n: rows.length })}</h2>
      {rows.map((a) => (
        <article className="amb-card" key={a.id}>
          <p className="t-strong">{t(`amb_reason_${a.reason}` as StringKey)}</p>
          {a.note && <p className="t-small">{a.note}</p>}
          <p className="t-small">{t('amb_from', { name: a.fromName, code: formatCode(a.code, a.initials), m: minutesSince(a.createdAt, now) })}</p>
          <CallButton phone={a.fromPhone} name={a.fromName} />
          {a.status === 'requested' && (
            <button className="btn btn-primary" type="button" disabled={busy === a.id} onClick={() => void answer(a, 'seen')}>{t('amb_mark_seen')}</button>
          )}
          <label className="field">
            {t('amb_eta')}
            <select className="input" value={eta[a.id] ?? ''} onChange={(e) => setEta((m) => ({ ...m, [a.id]: Number(e.target.value) || undefined }))}>
              <option value="">{t('amb_eta_choose')}</option>
              {ETAS.map((m) => <option key={m} value={m}>{t('amb_eta_option', { m })}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" type="button" disabled={busy === a.id || !eta[a.id]} onClick={() => void answer(a, 'dispatched')}>{t('amb_dispatch')}</button>
          {askWhy === a.id ? (
            <div className="stack">
              <label className="field">
                {t('amb_cannot_why')}
                <input className="input" value={why[a.id] ?? ''} onChange={(e) => setWhy((m) => ({ ...m, [a.id]: e.target.value }))} maxLength={300} />
              </label>
              <button className="btn btn-ghost" type="button" disabled={busy === a.id || !(why[a.id] ?? '').trim()} onClick={() => void answer(a, 'cannot_send')}>
                {t('amb_cannot_send')}
              </button>
            </div>
          ) : (
            <button className="link" type="button" onClick={() => setAskWhy(a.id)}>{t('amb_cannot_send')}</button>
          )}
        </article>
      ))}
    </section>
  );
}

/**
 * App-wide alert (H18): any request this clinic sent that nobody has seen for 10 minutes
 * shows on every screen, not only on the slip. Checks every 30 seconds while signed in.
 */
export function AmbulanceAlert({ deps }: { deps: AmbulanceDeps }) {
  const [late, setLate] = useState<AmbulanceRequest[]>([]);
  const refresh = useCallback(() => {
    void deps.list('sent').then((rows) => {
      const now = new Date();
      setLate((rows ?? []).filter((a) => notSeenTooLong(a, now)));
    });
  }, [deps]);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);
  if (late.length === 0) return null;
  return (
    <div className="amb-alert" role="alert">
      {late.map((a) => (
        <p key={a.id}>
          <span className="t-strong">{t('amb_alert', { name: a.toName, code: formatCode(a.code, a.initials) })}</span>{' '}
          {a.toPhone && <a className="amb-alert-call" href={`tel:${a.toPhone}`}>{t('amb_call', { name: a.toName })}</a>}
        </p>
      ))}
    </div>
  );
}
