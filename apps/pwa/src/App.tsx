// The one path of the M2 slice (ADR-19): sign in, choose age band, photograph or upload
// a chest X-ray, quality check, cxr-pre-2, TB model on the phone, zone, save the record.
import { useCallback, useEffect, useRef, useState } from 'react';
import { InferenceClient, type Ready } from './inference/client';
import type { Screened } from './inference/messages';
import { createCase, finishCase, openCaseDb, type CaseResult, type LocalCase } from './lib/caseStore';
import { loadThresholds, type ThresholdsState } from './lib/config';
import { PREPROCESS_VERSION } from './lib/preprocess';
import type { RetakeReason } from './lib/quality';
import { MODEL_RUN, saveScreening, type AgeBand, type InferenceRow } from './lib/records';
import { backendConfigured, supabase } from './lib/supabase';
import { ageAfter, backendRequired, canScreen, modelMatches, type EndAction } from './lib/session';
import { sigmoid, zoneFor, type Thresholds, type Zone } from './lib/triage';
import { CaseDetail, CaseLog } from './screens/Cases';
import { Monitor } from './screens/Monitor';
import { Home } from './screens/Home';
import { SignIn } from './screens/SignIn';
import { Blocked, Checking, ErrorScreen, Retake, Result } from './screens/Flow';
import { t } from './strings';

type View =
  | { name: 'home' }
  | { name: 'checking'; step: 0 | 1 | 2 }
  | { name: 'retake'; reason: RetakeReason }
  | { name: 'result'; zone: 'refer_now' | 'unsure' | 'low_risk'; saved: boolean | null; probability: number | null; caseCode: string | null }
  | { name: 'error' }
  | { name: 'cases' }
  | { name: 'case'; id: string };

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
  // Local case log (E8-06). Demo cases go to their own database, never mixed with real ones.
  const [db, setDb] = useState<IDBDatabase | null | 'unavailable'>(null);

  useEffect(() => {
    let open: IDBDatabase | null = null;
    openCaseDb(indexedDB, demo ? 'triagelens-demo' : undefined).then(
      (d) => { open = d; setDb(d); },
      () => setDb('unavailable'),
    );
    return () => open?.close();
  }, []);

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
    // Write the case before the model runs, so a crash cannot lose it (FR-07, H9).
    const store = db && db !== 'unavailable' ? db : null;
    const local: LocalCase | null = store ? await createCase(store, age).catch(() => null) : null;
    const finish = (status: 'result' | 'retake' | 'error', result: CaseResult | null) =>
      store && local ? finishCase(store, local.id, status, result).then(() => true, () => false) : Promise.resolve(false);
    let r: Screened;
    try {
      r = await client.current.screen(file, (step) => setView({ name: 'checking', step }));
    } catch {
      void finish('error', null);
      return setView({ name: 'error' });
    }
    const probability = r.logit == null ? null : sigmoid(r.logit);
    const zone = zoneFor(probability ?? Number.NaN, thresholds.thresholds, r.quality.passed);
    const totalMs = performance.now() - started;
    const kept = await finish(zone === 'retake' ? 'retake' : 'result', {
      zone,
      modelVersion: demo ? 'demo-stand-in' : MODEL_RUN,
      modelSha256: model.modelSha256,
      thresholdsVersion: thresholds.thresholds.version,
      preprocessVersion: r.preprocess,
      quality: r.quality,
    });
    const caseCode = kept && local ? local.code : null;
    const record = { caseId: local?.id, ageBand: age, screened: r, zone, probability, thresholdsVersion: thresholds.thresholds.version, modelSha256: model.modelSha256, totalMs };
    if (demo) {
      demo.record(r, zone, probability, totalMs);
      return setView(zone === 'retake' ? { name: 'retake', reason: r.quality.reason ?? 'blank' } : { name: 'result', zone, saved: null, probability, caseCode });
    }
    if (zone === 'retake') {
      setView({ name: 'retake', reason: r.quality.reason ?? 'blank' });
      void saveScreening(record);
      return;
    }
    setView({ name: 'result', zone, saved: null, probability, caseCode });
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
  if (view.name === 'cases') {
    return <CaseLog db={db} onBack={() => setView({ name: 'home' })} onOpen={(id) => setView({ name: 'case', id })} />;
  }
  if (view.name === 'case' && db && db !== 'unavailable') {
    return <CaseDetail db={db} id={view.id} onBack={() => setView({ name: 'cases' })} />;
  }

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
          caseCode={view.caseCode}
          versions={{ model: demo ? 'demo-stand-in' : MODEL_RUN, thresholds: thresholds?.ok ? thresholds.thresholds.version : '–', preprocess: PREPROCESS_VERSION }}
          devScore={import.meta.env.DEV && thresholds?.ok && view.probability != null ? { probability: view.probability, screenOut: thresholds.thresholds.screenOut, refer: thresholds.thresholds.refer } : undefined}
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
          onCases={() => setView({ name: 'cases' })}
          onSignOut={supabase && !demo ? () => void supabase!.auth.signOut() : null}
          backendNote={!backendConfigured && !demo}
          demo={Boolean(demo)}
        />
      );
  }
}
}
