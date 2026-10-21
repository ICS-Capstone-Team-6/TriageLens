// Checking, retake, result and blocking screens. Result wording is the exact TRD 7.2 text
// from strings/en.json; every result carries the reminder and the three versions (TRD 7.3, FR-12).
import { useState } from 'react';
import type { RetakeReason } from '../lib/quality';
import { t, type StringKey } from '../strings';
import { Back, Mark, Retake as RetakeIcon, XRay, ZoneIcon } from '../ui/icons';

function Bar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="bar">
      <button className="btn btn-round" type="button" aria-label={t('back')} onClick={onBack}><Back /></button>
      <span className="bar-title">{title}</span>
    </header>
  );
}

export function Checking({ step }: { step: 0 | 1 | 2 }) {
  const rows: { key: StringKey; state: 'done' | 'open' | 'wait' }[] = [
    { key: 'step_quality', state: step > 0 ? 'done' : 'open' },
    { key: 'step_prepare', state: step > 1 ? 'done' : step === 1 ? 'open' : 'wait' },
    { key: 'step_model', state: step === 2 ? 'open' : 'wait' },
  ];
  return (
    <main className="screen">
      <header className="bar"><span className="bar-title">{t('screening_header')}</span></header>
      <div className="xray"><XRay /></div>
      <div className="stack">
        <h1 className="h1">{t('checking_title')}</h1>
        <p className="muted">{t('checking_body')}</p>
      </div>
      <ol className="steps" aria-live="polite">
        {rows.map((r) => (
          <li key={r.key}>
            <span className={`step-name${r.state === 'open' ? ' strong' : ''}`}>
              <span className={`dot${r.state === 'open' ? ' open' : r.state === 'wait' ? ' wait' : ''}`} aria-hidden="true" />
              {t(r.key)}
            </span>
            <span className="small">{t(r.state === 'done' ? 'step_done' : r.state === 'open' ? 'step_working' : 'step_waiting')}</span>
          </li>
        ))}
        <li aria-hidden="true" style={{ display: 'block' }}><div className="progress"><div /></div></li>
      </ol>
    </main>
  );
}

export function Retake({ reason, onRetake, onCancel }: { reason: RetakeReason; onRetake: () => void; onCancel: () => void }) {
  return (
    <main className="screen">
      <Bar title={t('screening_header')} onBack={onCancel} />
      <section className="panel panel-big" role="alert" style={{ marginTop: 24 }}>
        <RetakeIcon />
        <h1 className="h1">{t(`retake_title_${reason}` as StringKey)}</h1>
        <p className="lead">{t(`retake_body_${reason}` as StringKey)}</p>
        <p className="muted">{t('retake_no_result')}</p>
      </section>
      <div className="spacer" />
      <div className="stack">
        <button className="btn btn-primary" type="button" onClick={onRetake}>{t('retake_button')}</button>
        <button className="btn btn-secondary" type="button" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </main>
  );
}

export function ErrorScreen({ onBack }: { onBack: () => void }) {
  return (
    <main className="screen">
      <Bar title={t('screening_header')} onBack={onBack} />
      <section className="panel panel-big" role="alert" style={{ marginTop: 24 }}>
        <h1 className="h1">{t('error_title')}</h1>
        <p className="lead">{t('error_body')}</p>
      </section>
      <div className="spacer" />
      <button className="btn btn-primary" type="button" onClick={onBack}>{t('done_new')}</button>
    </main>
  );
}

interface ResultProps {
  zone: 'refer_now' | 'unsure' | 'low_risk';
  versions: { model: string; thresholds: string; preprocess: string };
  saved: boolean | null;
  onDone: () => void;
  onRetake: () => void;
}

export function Result({ zone, versions, saved, onDone, onRetake }: ResultProps) {
  const [referred, setReferred] = useState(false);
  return (
    <main className="screen">
      <Bar title={t('result_header')} onBack={onDone} />
      <section className={`zone zone-${zone}`} aria-labelledby="zone-name">
        <div className="zone-head">
          <ZoneIcon zone={zone} />
          <h1 className="zone-name" id="zone-name">{t(`zone_${zone}` as StringKey)}</h1>
        </div>
        <p className="zone-message">{t(`message_${zone}` as StringKey)}</p>
        {zone === 'low_risk' && <p className="lead strong">{t('action_low_risk')}</p>}
      </section>
      <dl className="conditions">
        <div><dt>{t('condition_tb')}</dt><dd>{t(`zone_${zone}` as StringKey)}</dd></div>
        <div><dt className="muted">{t('condition_pneumonia')}</dt><dd className="off">{t('not_checked')}</dd></div>
      </dl>
      {referred && <p className="panel lead" role="status">{t('refer_confirm')}</p>}
      <div className="spacer" />
      <p className="lead strong center">{t('reminder')}</p>
      {zone === 'unsure' ? (
        <div className="row2">
          <button className="btn btn-primary" type="button" onClick={onRetake}>{t('retake')}</button>
          <button className="btn btn-dark" type="button" onClick={() => setReferred(true)}>{t('refer')}</button>
        </div>
      ) : (
        <button className="btn btn-primary" type="button" onClick={onDone}>{t('done_new')}</button>
      )}
      {saved !== null && <p className="small center" role="status">{saved ? t('saved') : t('not_saved')}</p>}
      <p className="versions">{t('versions', versions)}</p>
    </main>
  );
}

export function Blocked({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <main className="screen">
      <header className="bar brand"><Mark />{t('app_name')}</header>
      <div className="spacer" />
      <section className="panel panel-big" role="alert">
        <h1 className="h1">{title}</h1>
        <p className="lead">{body}</p>
      </section>
      <div className="spacer" />
      {action && onAction && <button className="btn btn-primary" type="button" onClick={onAction}>{action}</button>}
      <p className="small center">{t('reminder')} {t('prototype_note')}</p>
    </main>
  );
}
