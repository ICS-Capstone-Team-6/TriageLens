// Development only (import.meta.env.DEV): renders one screen with sample props so the UI
// checkers (taste-skill inspector, impeccable detect) can see every state. Not in builds.
import { Blocked, Checking, Retake, Result } from './Flow';
import { Home } from './Home';
import { SignIn } from './SignIn';
import { t } from '../strings';

const versions = { model: 'efficientnet_lite0_seed1_20261021T114608Z', thresholds: 'v0-uncalibrated', preprocess: 'cxr-pre-2' };
const noop = () => {};

export function Preview({ name }: { name: string }) {
  switch (name) {
    case 'signin': return <SignIn onSignIn={async () => {}} error={null} />;
    case 'home': return <Home age="25-34" onAge={noop} onFile={noop} ready modelReady onMonitor={noop} onSignOut={noop} backendNote={false} />;
    case 'checking': return <Checking step={2} />;
    case 'retake': return <Retake reason="too_dark" onRetake={noop} onCancel={noop} />;
    case 'result-refer': return <Result zone="refer_now" versions={versions} saved onDone={noop} onRetake={noop} />;
    case 'result-unsure': return <Result zone="unsure" versions={versions} saved onDone={noop} onRetake={noop} devScore={{ probability: 0.471, screenOut: 0.090453, refer: 0.90177 }} />;
    case 'result-low': return <Result zone="low_risk" versions={versions} saved onDone={noop} onRetake={noop} />;
    case 'under15': return <Blocked title={t('under15_title')} body={t('under15_body')} action={t('under15_back')} onAction={noop} />;
    default: return <Blocked title={t('not_ready_title')} body={t('not_ready_pending')} />;
  }
}
