---
name: pwa-offline-first
description: Offline-first PWA rules for the TriageLens app. Use when writing or reviewing code under apps/pwa that touches the service worker, caching, IndexedDB, the sync outbox, image encryption, Web Workers, cross-origin isolation headers, memory limits, persistent storage, iOS behaviour, or Playwright offline tests.
paths:
  - "apps/pwa/**"
allowed-tools: Read, Grep, Glob
---

# PWA offline-first

Enforces TRD 10.5 (client design), 10.8 (sync protocol), 10.2, NFR-OFFL-01/02, NFR-REL-01 to 04, NFR-PERF-04/05/07, NFR-SEC-02/05, NFR-PRIV-03, ADR-1, ADR-2, ADR-7, ADR-12.
Supports stories E8-02, E8-03, E8-04, E8-06, E9-02, E9-03, E13-02, E5-04.

Stack (TRD 10.4): React 18, TypeScript, Vite, Workbox, a small IndexedDB wrapper, ONNX Runtime Web, Web Workers, WebCrypto. No third-party scripts (NFR-SEC-05).

## Service worker and cache (TRD 10.5)

- [ ] Precache the app shell; app shell at most 300 KB gzip (NFR-PERF-05).
- [ ] Cache models after first load; offline fallback page.
- [ ] Update only when idle; never swap models mid-screening.

## Local store (ADR-7, FR-07)

- [ ] IndexedDB via a small wrapper. Not localStorage for cases.
- [ ] Case record is written **at capture**, before inference, so a crash cannot lose it (FR-07, NFR-REL-01, H9).
- [ ] Request persistent storage (`navigator.storage.persist()`); warn the user on storage pressure; never drop cases silently (NFR-REL-04, R12).
- [ ] Images stored as compressed WebP, about 300 KB each at most; local cap default 200 MB.
- [ ] Queue capacity at least 500 cases (NFR-OFFL-02).
- [ ] EXIF and GPS stripped before storage (FR-01, NFR-PRIV-03).

## Encryption (NFR-SEC-02)

- [ ] Images at rest: AES-GCM 256-bit via WebCrypto.
- [ ] Key derived from the user PIN with PBKDF2, 600,000 iterations or more (measure on the reference phone; TBD, see D2).
- [ ] Unique random IV per encryption; never reuse.
- [ ] PIN lockout after 5 wrong tries; offline unlock window 14 days; local cases kept after the window ends (FR-09).

## Sync outbox (TRD 10.8)

- [ ] Client-generated UUID per case, written locally first.
- [ ] Outbox holds ordered changes, each with case id, version number and hash.
- [ ] Idempotent upsert keyed by id and version; repeating a batch changes nothing (NFR-REL-02).
- [ ] Inferences immutable; notes last-write-wins by version; reviews server-wins.
- [ ] Clear outbox entries only for versions the server accepted; retry with backoff.
- [ ] UI always shows unsynced count and last successful sync time.
- [ ] Upload images only when consent exists (FR-13, ADR-10).

## Workers and responsiveness (TRD 10.5, NFR-PERF-07)

- [ ] Decoding, quality checks and inference run in Web Workers.
- [ ] No main-thread task over 50 ms during inference.
- [ ] Transfer `ArrayBuffer`s instead of copying large images.

## Cross-origin isolation (TRD 10.5, ADR-2, R10)

- [ ] Serve `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (Vercel headers).
- [ ] Check `crossOriginIsolated` at runtime; if false, fall back to one WebAssembly thread.
- [ ] No third-party embeds (they break isolation and violate NFR-SEC-05).

## Memory guard (TRD 10.5, NFR-PERF-04)

- [ ] If `navigator.deviceMemory` is 2 or less (or unknown on a low-end device): one thread, smaller input size, one model at a time.
- [ ] Peak memory during inference at most 350 MB.

## iOS (TRD 10.5, A9, R9)

- [ ] Background sync is limited: always show a visible "Sync now" button.
- [ ] Android Chrome is the primary target; iOS Safari 16 or newer is best effort (NFR-COMP-01).

## Tests (TRD 13.1, E13-02)

- [ ] Playwright end-to-end with network disabled: capture to result to save works offline (NFR-OFFL-01).
- [ ] Sync after reconnect: 50 cases created offline sync with no duplicates or losses (FR-08).
- [ ] Kill the app mid-save and mid-sync; no lost cases (NFR-REL-01).
- [ ] Unit tests for outbox idempotency (repeat a batch, assert no change) and encryption round-trip.
- [ ] Sync logic at least 70% line coverage (NFR-MAINT-01).

For result-screen wording and zone logic, use the `triage-safety-review` skill.
