// Welcome and sign in (canvas "0 Sign in"): the drawn scanner sweeps a beam over a grid of
// film tiles, then two actions. Sign in opens a sheet (Jakob: the familiar pattern); the help
// sheet explains how to get an account. Motion is one looping beam, off under reduced motion.
import { useState, type FormEvent } from 'react';
import { t } from '../strings';
import { Sheet } from '../ui/kit';

function Scanner() {
  return (
    <div className="welcome-art" aria-hidden="true">
      <svg className="scanner" width="150" height="82" viewBox="0 0 150 82" fill="none">
        <defs>
          <linearGradient id="hb" x1="75" y1="34" x2="75" y2="76" gradientUnits="userSpaceOnUse"><stop stopColor="#5bb8e6" /><stop offset=".55" stopColor="#2597d0" /><stop offset="1" stopColor="#1b7db0" /></linearGradient>
          <linearGradient id="hk" x1="75" y1="0" x2="75" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#2a2a30" /><stop offset="1" stopColor="#070709" /></linearGradient>
        </defs>
        <path d="M53 18c0-9.9 8.1-16 22-16s22 6.1 22 16v20H53z" fill="url(#hk)" />
        <rect x="8" y="32" width="134" height="42" rx="21" fill="url(#hb)" />
        <circle className="blink" cx="52" cy="48" r="3.6" fill="#fff" />
        <circle className="blink d2" cx="75" cy="48" r="3.6" fill="#fff" />
        <circle className="blink d3" cx="98" cy="48" r="3.6" fill="#fff" />
        <rect x="37" y="60" width="76" height="9" rx="4.5" fill="#0d3f5c" />
        <rect x="40" y="62" width="70" height="5" rx="2.5" fill="#d7e6f5" />
      </svg>
      <div className="cone"><span className="beam" />{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</div>
    </div>
  );
}

export function SignIn({ onSignIn, error }: { onSignIn: (email: string, password: string) => Promise<void>; error: string | null }) {
  const [sheet, setSheet] = useState<'none' | 'signin' | 'help'>('none');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    await onSignIn(email.trim(), password);
    setBusy(false);
  }

  return (
    <main className="screen welcome">
      <div className="welcome-top">
        <p className="t-lead" style={{ color: 'var(--ink)' }}>{t('welcome_to')}</p>
        <h1 style={{ fontSize: 48, lineHeight: .95, letterSpacing: '-.045em', fontWeight: 600 }}>{t('app_name')}</h1>
        <p className="t-lead">{t('welcome_body')}</p>
      </div>
      <Scanner />
      <div className="foot" style={{ position: 'static', background: 'none' }}>
        <div className="foot-in">
          <button className="btn btn-primary btn-lg btn-full" type="button" onClick={() => setSheet('signin')}>{t('signin_button')}</button>
          <button className="link" type="button" style={{ alignSelf: 'center' }} onClick={() => setSheet('help')}>{t('need_account')}</button>
          <p className="t-cap" style={{ textAlign: 'center' }}>{t('prototype_note')} {t('reminder')}</p>
        </div>
      </div>

      {(sheet === 'signin' || error) && sheet !== 'help' && (
        <Sheet label={t('signin_title')} onClose={() => setSheet('none')}>
          <form className="body" style={{ gap: 16, paddingBottom: 24 }} onSubmit={(e) => void submit(e)} noValidate>
            <div className="stack-tight"><h2 className="t-title" style={{ fontSize: 26 }}>{t('signin_title')}</h2><p className="t-lead">{t('signin_body')}</p></div>
            <label className="field">{t('email')}
              <input className="input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error)} />
            </label>
            <label className="field"><span className="field-row">{t('password')}<button className="link" type="button" onClick={() => setShow(!show)}>{show ? t('hide') : t('show')}</button></span>
              <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={busy || !email || !password}>{busy ? t('signin_working') : t('signin_button')}</button>
            <p className="t-small">{t('signin_offline_note')}</p>
          </form>
        </Sheet>
      )}
      {sheet === 'help' && (
        <Sheet label={t('need_account')} onClose={() => setSheet('none')}>
          <div className="body" style={{ gap: 16, paddingBottom: 24 }}>
            <h2 className="t-title" style={{ fontSize: 26 }}>{t('need_account')}</h2>
            <ol className="tl">
              <li>{t('help_step1')}</li>
              <li>{t('help_step2')}</li>
              <li>{t('help_step3')}</li>
            </ol>
            <button className="btn btn-primary btn-lg btn-full" type="button" onClick={() => setSheet('signin')}>{t('have_account')}</button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
