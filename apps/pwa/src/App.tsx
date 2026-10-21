// The one path of the M2 slice (ADR-19): sign in, choose age band, photograph or upload
// a chest X-ray, quality check, cxr-pre-2, TB model on the phone, zone, save the record.
import { useCallback, useEffect, useRef, useState } from 'react';
import { InferenceClient, type Ready } from './inference/client';
import type { Screened } from './inference/messages';
import { loadThresholds, type ThresholdsState } from './lib/config';
import { PREPROCESS_VERSION } from './lib/preprocess';
import type { RetakeReason } from './lib/quality';
import { MODEL_RUN, saveScreening, type AgeBand, type InferenceRow } from './lib/records';
import { backendConfigured, supabase } from './lib/supabase';
import { ageAfter, backendRequired, canScreen, modelMatches, type EndAction } from './lib/session';
import { sigmoid, zoneFor, type Thresholds, type Zone } from './lib/triage';
import { Monitor } from './screens/Monitor';
import { Home } from './screens/Home';
import { SignIn } from './screens/SignIn';
import { Blocked, Checking, ErrorScreen, Retake, Result } from './screens/Flow';
import { t } from './strings';

type View =
  | { name: 'home' }
  | { name: 'checking'; step: 0 | 1 | 2 }
  | { name: 'retake'; reason: RetakeReason }
  | { name: 'result'; zone: 'refer_now' | 'unsure' | 'low_risk'; saved: boolean | null }
  | { name: 'error' };

/** Development-only demo wiring, injected by main.tsx; production never passes it. */
export interface DemoHooks {
  client: { init(): Promise<Ready>; screen(file: Blob, onProgress: (step: 1 | 2) => void): Promise<Screened> };
  thresholds: Thresholds;
  sha: string;
  record: (s: Screened, zone: Zone, probability: number | null, totalMs: number) => void;
  rows: InferenceRow[];
  banner: React.ReactNode;
}

const MODEL_URL = (import.meta.env.VITE_MODEL_URL as string | undefined) ?? '';
const MODEL_SHA256 = (import.meta.env.VITE_MODEL_SHA256 as string | undefined) ?? '';

export function App({ demo }: { demo?: DemoHooks }) {
  const [route, setRoute] = useState(location.hash === '#/monitor' ? 'monitor' : 'app');
  const [signedIn, setSignedIn] = useState<boolean | null>(backendConfigured && !demo ? null : false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<ThresholdsState | null>(null);
  const [model, setModel] = useState<Ready | 'loading' | 'failed'>('loading');
  const [age, setAge] = useState<AgeBand | 'under15' | null>(null);
  const [view, setView] = useState<View>({ name: 'home' });
  const client = useRef<Pick<DemoHooks['client'], 'screen'> | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(location.hash === '#/monitor' ? 'monitor' : 'app');
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (demo) {
      client.current = demo.client;
      setThresholds({ ok: true, thresholds: demo.thresholds, runId: MODEL_RUN, modelSha256: demo.sha });
      demo.client.init().then(setModel, () => setModel('failed'));
      return;
    }
    void loadThresholds(MODEL_RUN).then(setThresholds);
    const real = new InferenceClient();
    client.current = real;
    if (!MODEL_URL) setModel('failed');
    else real.init(MODEL_URL, MODEL_SHA256).then(setModel, () => setModel('failed'));
    if (supabase) {
      void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
      const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(Boolean(session)));
      return () => data.subscription.unsubscribe();
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setSignInError(t('signin_failed'));
    const { data: profile } = await supabase.from('profiles').select('facility_id').single();
    if (!profile?.facility_id) {
      await supabase.auth.signOut();
      return setSignInError(t('no_clinic'));
    }
    setSignInError(null);
  }, []);

  const go = (hash: string) => { location.hash = hash; };

  async function screen(file: File) {
    if (!client.current || typeof model !== 'object' || !thresholds?.ok || !canScreen(true, true, age) || age === null || age === 'under15') return;
    const started = performance.now();
    setView({ name: 'checking', step: 0 });
    let r: Screened;
    try {
      r = await client.current.screen(file, (step) => setView({ name: 'checking', step }));
    } catch {
      return setView({ name: 'error' });
    }
    const probability = r.logit == null ? null : sigmoid(r.logit);
    const zone = zoneFor(probability ?? Number.NaN, thresholds.thresholds, r.quality.passed);
    const totalMs = performance.now() - started;
    const record = { ageBand: age, screened: r, zone, probability, thresholdsVersion: thresholds.thresholds.version, modelSha256: model.modelSha256, totalMs };
    if (demo) {
      demo.record(r, zone, probability, totalMs);
      return setView(zone === 'retake' ? { name: 'retake', reason: r.quality.reason ?? 'blank' } : { name: 'result', zone, saved: null });
    }
    if (zone === 'retake') {
      setView({ name: 'retake', reason: r.quality.reason ?? 'blank' });
      void saveScreening(record);
      return;
    }
    setView({ name: 'result', zone, saved: null });
    const saved = await saveScreening(record);
    setView((v) => (v.name === 'result' ? { ...v, saved } : v));
  }

  const screenEl = renderScreen();
  if (demo) return <>{demo.banner}{screenEl}</>;
  return screenEl;

  function renderScreen() {
  if (backendRequired(import.meta.env.PROD, backendConfigured)) return <Blocked title={t('not_ready_title')} body={t('backend_required')} />;
  if (!demo && backendConfigured && signedIn === null) return null;
  if (!demo && backendConfigured && !signedIn) return <SignIn onSignIn={signIn} error={signInError} />;
  if (route === 'monitor') return <Monitor onBack={() => go('#/')} rows={demo ? [...demo.rows] : undefined} />;

  if (age === 'under15') {
    return <Blocked title={t('under15_title')} body={t('under15_body')} action={t('under15_back')} onAction={() => setAge(null)} />;
  }
  if (thresholds && !thresholds.ok) {
    const body = thresholds.reason === 'pending' ? t('not_ready_pending') : t('not_ready_invalid');
    return <Blocked title={t('not_ready_title')} body={body} />;
  }
  if (model === 'failed') return <Blocked title={t('not_ready_title')} body={t('not_ready_model')} />;
  if (thresholds?.ok && typeof model === 'object' && !modelMatches(model.modelSha256, thresholds.modelSha256)) {
    return <Blocked title={t('not_ready_title')} body={t('not_ready_invalid')} />;
  }

  const end = (action: EndAction) => {
    setAge((a) => ageAfter(action, a));
    setView({ name: 'home' });
  };
  switch (view.name) {
    case 'checking':
      return <Checking step={view.step} />;
    case 'retake':
      return <Retake reason={view.reason} onRetake={() => end('retake')} onCancel={() => end('cancel')} />;
    case 'error':
      return <ErrorScreen onBack={() => end('error')} />;
    case 'result':
      return (
        <Result
          zone={view.zone}
          saved={backendConfigured ? view.saved : null}
          versions={{ model: demo ? 'demo-stand-in' : MODEL_RUN, thresholds: thresholds?.ok ? thresholds.thresholds.version : '–', preprocess: PREPROCESS_VERSION }}
          onDone={() => end('done')}
          onRetake={() => end('retake')}
        />
      );
    default:
      return (
        <Home
          age={age}
          onAge={setAge}
          onFile={(f) => void screen(f)}
          ready={canScreen(typeof model === 'object', Boolean(thresholds?.ok), age)}
          modelReady={typeof model === 'object'}
          onMonitor={() => go('#/monitor')}
          onSignOut={supabase && !demo ? () => void supabase!.auth.signOut() : null}
          backendNote={!backendConfigured && !demo}
          demo={Boolean(demo)}
        />
      );
  }
}
}
