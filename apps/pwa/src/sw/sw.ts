/// <reference lib="webworker" />
// Service worker (E8-02): the app opens and screens with no network once it has loaded once.
// Built by Vite as /sw.js; the build injects the file list and build ID (vite.config.ts).
import { routeFor, SHELL_CACHE_PREFIX, staleCaches } from './routes';

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: string[];
declare const __BUILD_ID__: string;

const SHELL = `${SHELL_CACHE_PREFIX}${__BUILD_ID__}`;

// No skipWaiting: a new build waits until every TriageLens tab is closed, so it never swaps
// files or deletes the old shell in the middle of a screening (update only when idle).
// The first install still takes control at once through clients.claim() on activate.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(__PRECACHE__)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(staleCaches(names, SHELL).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function fromCache(req: Request | string): Promise<Response | undefined> {
  return (await caches.open(SHELL)).match(req, { ignoreSearch: true });
}

async function networkFirst(req: Request, fallback: Request | string): Promise<Response> {
  try {
    const r = await fetch(req);
    if (r.ok) await (await caches.open(SHELL)).put(fallback, r.clone());
    return r;
  } catch {
    return (await fromCache(fallback)) ?? Response.error();
  }
}

async function cacheFirst(req: Request): Promise<Response> {
  const hit = await fromCache(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && r.type === 'basic') await (await caches.open(SHELL)).put(req, r.clone());
  return r;
}

self.addEventListener('fetch', (e) => {
  const route = routeFor(e.request, self.location.origin);
  if (route === 'bypass') return;
  if (route === 'shell') e.respondWith(networkFirst(e.request, '/index.html'));
  else if (route === 'network-first') e.respondWith(networkFirst(e.request, new URL(e.request.url).pathname));
  else e.respondWith(cacheFirst(e.request));
});
