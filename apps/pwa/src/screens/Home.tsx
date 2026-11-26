// Camera-first home (canvas "1 Ready: camera first"). The phone's own camera opens from the
// shutter; there is no live preview in this version (E8-07 is a Should), so the stage shows a
// drawn film. Age band first (Hick: one row of choices); Under 15 turns the shutter off with a
// note (H5). The shutter is the one large target (Fitts).
import { useEffect, useRef, useState } from 'react';
import type { AgeBand } from '../lib/records';
import { t } from '../strings';
import { Film, ImageIcon, Info, Wifi, WifiOff } from '../ui/icons';
import { Dock, type Tab } from '../ui/kit';

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
  demo?: boolean;
  tabs: { id: Tab; href: string }[];
}

export function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    addEventListener('online', up); addEventListener('offline', down);
    return () => { removeEventListener('online', up); removeEventListener('offline', down); };
  }, []);
  return on;
}

export function Home({ age, onAge, onFile, ready, modelReady, onMonitor, onSignOut, backendNote, tabs }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const under = age === 'under15';
  // H5: the shutter and upload stay off for under 15 even if a caller passes ready=true.
  const canShoot = ready && !under;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile(f);
  };
  const hint = !modelReady ? t('hint_loading') : under ? t('hint_under15') : age === null ? t('hint_age') : t('hint_ready');

  return (
    <main className="cam">
      <div className="cam-glow" aria-hidden="true" />

      <header className="cam-top">
        <h1 className="who">{t('app_name')}</h1>
        <span className="net" role="status">{online ? <Wifi size={16} /> : <WifiOff size={16} />}{online ? t('online') : t('offline')}</span>
      </header>
      <p className="cam-hint" role="status" aria-live="polite"><Info size={16} color="#2597d0" />{hint}</p>
      <div className="cam-film" aria-hidden="true"><Film width={150} /></div>

      <div className="cam-lower">
        {under && <p className="cam-note" role="alert"><b>{t('under15_title')}.</b> {t('under15_body')}</p>}
        {backendNote && <p className="cam-note">{t('backend_missing')}</p>}
        <p className="cam-use">{t('prototype_note')} {t('reminder')}</p>
        <div className="ages" role="group" aria-label={t('age_question')}>
          {BANDS.map((b) => (
            <button key={b} type="button" aria-pressed={age === b} onClick={() => onAge(b)}>{b}</button>
          ))}
          <button type="button" aria-pressed={under} onClick={() => onAge('under15')}>{t('age_under_15')}</button>
        </div>
        <div className="shoot-row">
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <button className="link" type="button" onClick={onMonitor} style={{ color: '#fff', fontSize: 13, minHeight: 48 }}>{t('monitor_link')}</button>
            {onSignOut && <button className="link" type="button" onClick={onSignOut} style={{ color: '#fff', fontSize: 13, minHeight: 48 }}>{t('sign_out')}</button>}
          </span>
          <button className="shutter" type="button" aria-label={t('take_photo')} disabled={!canShoot} onClick={() => camera.current?.click()} />
          <button className="upload" type="button" aria-label={t('upload')} disabled={!canShoot} onClick={() => upload.current?.click()}>
            <ImageIcon size={22} color="#ffffff" />
          </button>
        </div>
        <input ref={camera} className="file" type="file" accept="image/*" capture="environment" onChange={pick} tabIndex={-1} aria-hidden="true" />
        <input ref={upload} className="file" type="file" accept="image/*" onChange={pick} tabIndex={-1} aria-hidden="true" />
      </div>
      <Dock current="screen" tabs={tabs} />
    </main>
  );
}
