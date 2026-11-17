import { useState, type FormEvent } from 'react';
import { t } from '../strings';
import { Mark } from '../ui/icons';

export function SignIn({ onSignIn, error }: { onSignIn: (email: string, password: string) => Promise<void>; error: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSignIn(email.trim(), password);
    setBusy(false);
  }

  return (
    <main className="screen">
      <header className="bar brand"><Mark />{t('app_name')}</header>
      <div className="stack" style={{ marginTop: 24 }}>
        <h1 className="h1">{t('signin_title')}</h1>
        <p className="lead">{t('signin_body')}</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <label className="field">
          {t('email')}
          <input type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          {t('password')}
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="spacer" />
        <button className="btn btn-primary" type="submit" disabled={busy || !email || !password}>
          {busy ? t('signin_working') : t('signin_button')}
        </button>
      </form>
      <div className="spacer" />
      <p className="small center">{t('reminder')} {t('prototype_note')}</p>
    </main>
  );
}
