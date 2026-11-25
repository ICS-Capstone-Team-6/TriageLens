import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
const render = (node: ReactNode) => root.render(<StrictMode>{node}</StrictMode>);
const params = new URLSearchParams(location.search);

// Development-only tools: single-screen previews and the clickable demo. The DEV check
// removes both from production builds.
if (import.meta.env.DEV && params.has('preview')) {
  void import('./screens/Preview').then(({ Preview }) => render(<Preview name={params.get('preview') ?? ''} />));
} else if (import.meta.env.DEV && params.has('demo')) {
  void Promise.all([import('./demo/demo'), import('./demo/DemoBar'), import('./demo/referralDemo')]).then(([d, { DemoBar }, r]) =>
    render(
      <App
        demo={{
          client: new d.DemoClient(),
          thresholds: d.DEMO_THRESHOLDS,
          sha: d.DEMO_SHA,
          record: d.recordDemo,
          rows: d.demoRows,
          banner: <DemoBar />,
          referral: r.demoReferral,
          inbox: r.demoInbox,
          cam: r.demoCam,
        }}
      />,
    ),
  );
} else {
  render(<App />);
}

// Offline (E8-02): register the service worker in production web builds only. The Android
// app bundles its files already, and dev builds must always show fresh code. Ask the browser
// to keep our storage under pressure (pwa-offline rule); a refusal is not an error.
const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
if (import.meta.env.PROD && !native && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    void navigator.storage?.persist?.().catch(() => false);
  });
}
