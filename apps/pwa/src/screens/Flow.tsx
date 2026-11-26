// Checking, retake, result and blocking screens (canvas "2 Checking", "3a-3c Result",
// "3d Retake"). Result wording is the exact TRD 7.2 text from strings/en.json; every result
// carries the reminder and the three versions (TRD 7.3, FR-12). Zones: colour plus icon plus
// words (H8), the one strongly coloured block on the screen (Von Restorff).
import { useState } from 'react';
import type { RetakeReason } from '../lib/quality';
import { t, type StringKey } from '../strings';
import { ArrowUpRight, Film, Mark, Retake as RetakeIcon, ZoneIcon } from '../ui/icons';
import { Facts, Foot, Notice, TopBar, useSwipeDown } from '../ui/kit';

export function Checking({ step }: { step: 0 | 1 | 2 }) {
  const keys: StringKey[] = ['step_quality', 'step_prepare', 'step_model'];
  const pct = ['22%', '58%', '88%'][step];
  return (
    <main className="cam">
      <div className="cam-glow" aria-hidden="true" />
      <header className="cam-top"><h1 className="who">{t('checking_title')}</h1></header>
      <div className="cam-hint" role="status" aria-live="polite" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, borderRadius: 18, minWidth: 250, padding: '12px 16px' }}>
        <span key={step} className="pane">{t(keys[step])}</span>
        <span className="progress"><i style={{ width: pct }} /></span>
      </div>
      <div className="cam-film" aria-hidden="true" style={{ filter: 'brightness(.85)' }}>
        <Film width={150} />
        <span className="scanline" />
      </div>
      <div className="cam-lower" style={{ paddingBottom: 48 }}>
        <p className="cam-note">{t('checking_body')}</p>
      </div>
    </main>
  );
}

export function Retake({ reason, onRetake, onCancel }: { reason: RetakeReason; onRetake: () => void; onCancel: () => void }) {
  return (
    <main className="screen">
      <TopBar title={t('screening_header')} onBack={onCancel} />
      <div className="body has-foot pane">
        <span className="round" style={{ width: 56, height: 56 }} aria-hidden="true"><RetakeIcon size={26} /></span>
        <div className="stack">
          <h2 className="t-display" role="alert">{t(`retake_title_${reason}` as StringKey)}</h2>
          <p style={{ fontSize: 17, lineHeight: 1.45, color: 'var(--ink)' }}>{t(`retake_body_${reason}` as StringKey)}</p>
          <p className="t-small">{t('retake_no_result')}</p>
        </div>
      </div>
      <Foot remind={false}>
        <button className="btn btn-primary btn-lg btn-full" type="button" onClick={onRetake}><RetakeIcon />{t('retake_button')}</button>
        <button className="btn btn-ghost btn-full" type="button" onClick={onCancel}>{t('cancel')}</button>
      </Foot>
    </main>
  );
}

export function ErrorScreen({ onBack }: { onBack: () => void }) {
  return (
    <main className="screen">
      <TopBar title={t('screening_header')} onBack={onBack} />
      <div className="body has-foot">
        <div className="stack" role="alert">
          <h2 className="t-display">{t('error_title')}</h2>
          <p className="t-lead">{t('error_body')}</p>
        </div>
      </div>
      <Foot remind={false}><button className="btn btn-primary btn-lg btn-full" type="button" onClick={onBack}>{t('done_new')}</button></Foot>
    </main>
  );
}

interface ResultProps {
  zone: 'refer_now' | 'unsure' | 'low_risk';
  ageBand?: string;
  /** Local case code (E8-06); null when the phone could not save the case; undefined hides it. */
  caseCode?: string | null;
  versions: { model: string; thresholds: string; preprocess: string };
  saved: boolean | null;
  onDone: () => void;
  onRetake: () => void;
  /** Opens "Choose where to refer" (E10-03). Without it, the old advice text is shown. */
  onRefer?: () => void;
  /** True while the result is still being saved; the Refer button waits for it. */
  referBusy?: boolean;
  /** Development builds only: the raw score, for the team (TRD 7.3 keeps it off real screens). */
  devScore?: { probability: number; screenOut: number; refer: number };
}

export function Result({ zone, ageBand, caseCode, versions, saved, onDone, onRetake, onRefer, referBusy = false, devScore }: ResultProps) {
  const [referred, setReferred] = useState(false);
  const refer = () => (onRefer ? onRefer() : setReferred(true));
  const word = t(`zone_${zone}` as StringKey);
  // The panel looks like a sheet, so it slides down like one, but only for Low risk (it is the
  // same as "Next person"). Refer now and Not sure never slide away by accident: the worker must
  // choose Refer, Retake or Next person (uncertainty moves toward refer, never away from it).
  const dismissible = zone === 'low_risk';
  const { panel, grip } = useSwipeDown<HTMLElement>(onDone, dismissible);
  return (
    <main className="screen" style={{ background: 'var(--obsidian)' }}>
      <div style={{ height: 'max(48px, env(safe-area-inset-top))' }} />
      <section ref={panel} className="pane swipe" style={{ flex: 1, background: '#fff', borderRadius: '32px 32px 0 0', display: 'flex', flexDirection: 'column' }} aria-labelledby="zone-name">
        <div className={`zone-band zone-${zone}`} {...grip} style={dismissible ? { touchAction: 'none' } : undefined}>
          <span className="grab" aria-hidden="true" style={dismissible ? undefined : { visibility: 'hidden' }} />
          <h1 className="zone-name" id="zone-name"><ZoneIcon zone={zone} size={34} />{word}</h1>
          <p className="zone-msg">{t(`message_${zone}` as StringKey)}</p>
          {zone === 'low_risk' && <p style={{ fontSize: 16, fontWeight: 500 }}>{t('action_low_risk')}</p>}
        </div>
        <div className="body has-foot" style={{ gap: 16 }}>
          <Facts rows={[
            [t('condition_tb'), <b key="z" style={{ fontWeight: 600 }}>{word}</b>],
            [t('condition_pneumonia'), <span key="p" className="t-small">{t('not_checked')}</span>],
            ...(ageBand ? [[t('age_band'), ageBand] as [string, string]] : []),
            ...(caseCode ? [[t('case_label'), <span key="c" className="code">{caseCode}</span>] as [string, React.ReactNode]] : []),
          ]} />
          {devScore && (
            <p className="t-cap num">{t('dev_score', { p: devScore.probability.toFixed(3), so: devScore.screenOut.toFixed(4), ref: devScore.refer.toFixed(3) })}</p>
          )}
          {referred && <Notice role="status">{t('refer_confirm')}</Notice>}
          {caseCode === null && <Notice tone="warn" role="status">{t('result_case_failed')}</Notice>}
          {saved !== null && <p className="t-small" role="status">{saved ? t('saved') : t('not_saved')}</p>}
          <p className="t-cap">{t('versions', versions)}</p>
        </div>
      </section>
      <Foot>
        {zone === 'unsure' ? (
          <div className="grid2">
            <button className="btn btn-primary btn-lg" type="button" onClick={onRetake}><RetakeIcon />{t('retake')}</button>
            <button className="btn btn-ghost btn-lg" type="button" onClick={refer} disabled={referBusy} style={{ background: '#fff' }}><ArrowUpRight />{t('refer')}</button>
          </div>
        ) : zone === 'refer_now' && onRefer ? (
          <div className="grid2">
            <button className="btn btn-primary btn-lg" type="button" onClick={onRefer} disabled={referBusy}><ArrowUpRight />{referBusy ? t('refer_saving') : t('refer')}</button>
            <button className="btn btn-ghost btn-lg" type="button" onClick={onDone} style={{ background: '#fff' }}>{t('next_person')}</button>
          </div>
        ) : (
          <button className="btn btn-primary btn-lg btn-full" type="button" onClick={onDone}>{t('next_person')}</button>
        )}
      </Foot>
    </main>
  );
}

export function Blocked({ title, body, detail, action, onAction }: { title: string; body: string; detail?: string; action?: string; onAction?: () => void }) {
  return (
    <main className="screen">
      <header className="bar"><Mark /><span className="bar-title">{t('app_name')}</span></header>
      <div className="body has-foot" style={{ justifyContent: 'center' }}>
        <div className="cloud" role="alert" style={{ padding: 28 }}>
          <h1 className="t-display">{title}</h1>
          <p className="t-lead">{body}</p>
          {detail && <p className="t-cap" style={{ marginTop: 12, overflowWrap: 'anywhere' }}>{detail}</p>}
        </div>
        <p className="t-small">{t('prototype_note')}</p>
      </div>
      <Foot>{action && onAction && <button className="btn btn-primary btn-lg btn-full" type="button" onClick={onAction}>{action}</button>}</Foot>
    </main>
  );
}
