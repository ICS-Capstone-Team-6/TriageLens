// How the service worker handles each request (E8-02, NFR offline core flow). Pure, so it is
// tested in routes.test.ts without a browser.
//  - shell: page navigations. Network first so a new build shows when online; the cached
//    app shell when offline.
//  - network-first: the config files (thresholds, reference). Fresh when online, the last
//    good copy when offline. The app still checks the thresholds against the model hash (H7).
//  - cache-first: everything else from our own origin (hashed assets, ONNX Runtime files,
//    fonts, icons). Versioned by the build, so a cached copy is never stale.
//  - bypass: other origins (Supabase, the model host) and anything that is not a GET.
//    The model is cached by the inference worker itself, only after its SHA-256 matches.
export type Route = 'shell' | 'network-first' | 'cache-first' | 'bypass';

export interface RequestInfo {
  url: string;
  method: string;
  mode: string;
}

export function routeFor(req: RequestInfo, origin: string): Route {
  if (req.method !== 'GET') return 'bypass';
  let u: URL;
  try {
    u = new URL(req.url);
  } catch {
    return 'bypass';
  }
  if (u.origin !== origin) return 'bypass';
  if (req.mode === 'navigate') return 'shell';
  if (u.pathname.startsWith('/config/')) return 'network-first';
  if (u.pathname === '/sw.js') return 'bypass';
  return 'cache-first';
}

export const SHELL_CACHE_PREFIX = 'tl-shell-';
export const MODEL_CACHE = 'tl-model-v1';

/** Caches to delete when a new build activates: old shells only, never the model cache. */
export function staleCaches(names: string[], current: string): string[] {
  return names.filter((n) => n.startsWith(SHELL_CACHE_PREFIX) && n !== current);
}
