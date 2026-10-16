---
paths:
  - "apps/pwa/**"
---

# PWA offline-first

Source: TRD 8, 10.5, 10.8; ADR-1, ADR-2, ADR-7, ADR-12. Full checklist: `pwa-offline-first` skill.

- Offline is the normal case. The core flow (capture, check, result, save) must work with no network.
- Budgets: app shell at most 300 KB gzip; p95 inference at most 2.5 s; peak memory at most 350 MB; no main-thread task over 50 ms.
- Decoding, quality checks and inference run in Web Workers.
- Write the case to IndexedDB at capture, before inference. Never drop cases silently; warn on storage pressure.
- Request persistent storage. Images as WebP, about 300 KB each at most.
- Images at rest: AES-GCM 256 with a PBKDF2 key from the PIN (600,000 iterations or more).
- Sync: client UUIDs, ordered outbox, idempotent upsert by id and version, retry with backoff. Show unsynced count and last sync time.
- Serve COOP `same-origin` and COEP `require-corp`; fall back to one thread if not cross-origin isolated.
- 2 GB RAM or less: one thread, smaller input, one model at a time.
- Visible "Sync now" button (iOS limits). No third-party scripts.
- Strip EXIF and GPS from every image.
