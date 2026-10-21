import { useRef } from 'react';
import type { AgeBand } from '../lib/records';
import { t } from '../strings';
import { Camera, Clock, Mark, Phone } from '../ui/icons';

const BANDS: AgeBand[] = ['15-24', '25-34', '35-44', '45-54', '55-64', '65+'];

interface Props {
  age: AgeBand | 'under15' | null;
  onAge: (a: AgeBand | 'under15') => void;
  onFile: (f: File) => void;
  ready: boolean;
  modelReady: boolean;
  onMonitor: () => void;
  onSignOut: (() => void) | null;
  backendNote: boolean;
}

export function Home({ age, onAge, onFile, ready, modelReady, onMonitor, onSignOut, backendNote }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const canStart = ready;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile(f);
  };

  return (
    <main className="screen">
      <header className="bar">
        <span className="brand"><Mark />{t('app_name')}</span>
        <button className="link" type="button" onClick={onMonitor}>{t('monitor_link')}</button>
        {onSignOut && <button className="link" type="button" onClick={onSignOut}>{t('sign_out')}</button>}
      </header>

      <div className="stack">
        <h1 className="h1">{t('home_title')}</h1>
        <p className="lead">{t('home_body')}</p>
      </div>

      <fieldset className="choices">
        <legend>{t('age_question')}</legend>
        {BANDS.map((b) => (
          <label className="choice" key={b}>
            <input type="radio" name="age" value={b} checked={age === b} onChange={() => onAge(b)} />
            <span>{b}</span>
          </label>
        ))}
        <label className="choice" style={{ gridColumn: '1 / -1' }}>
          <input type="radio" name="age" value="under15" checked={age === 'under15'} onChange={() => onAge('under15')} />
          <span>{t('age_under_15')}</span>
        </label>
      </fieldset>

      <section className="panel" aria-live="polite">
        <div className="status">
          <Phone />
          <div>
            <p className="status-title">{modelReady ? t('model_ready') : t('model_loading')}</p>
            <p className="muted">{modelReady ? t('model_ready_body') : t('model_loading_body')}</p>
          </div>
        </div>
        <div className="status">
          <Clock />
          <div>
            <p className="status-title">{t('reminder')}</p>
            <p className="muted">{t('prototype_note')}</p>
          </div>
        </div>
        {backendNote && <p className="muted">{t('backend_missing')}</p>}
      </section>

      <div className="spacer" />

      <div className="stack">
        {!canStart && modelReady && <p className="muted center">{t('choose_age_first')}</p>}
        <input ref={camera} className="file" type="file" accept="image/*" capture="environment" onChange={pick} tabIndex={-1} aria-hidden="true" />
        <input ref={upload} className="file" type="file" accept="image/*" onChange={pick} tabIndex={-1} aria-hidden="true" />
        <button className="btn btn-primary" type="button" disabled={!canStart} onClick={() => camera.current?.click()}>
          <Camera />{t('take_photo')}
        </button>
        <button className="btn btn-secondary" type="button" disabled={!canStart} onClick={() => upload.current?.click()}>
          {t('upload')}
        </button>
      </div>
    </main>
  );
}
