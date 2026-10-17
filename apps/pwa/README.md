# PWA app

The installable offline React + TypeScript + Vite progressive web app: capture, results, case log, review and admin (TRD 10.2, 10.4, 14.1; ADR-1, ADR-12).

**Owner:** Kweku (app and UX lead). Micheal owns the inference worker and the capture overlay.

## What goes here

- App source, Web Workers, service worker, UI strings (externalized), Playwright tests

## What must not go here

- Model binaries (cached at runtime from the model registry).
- Third-party scripts (NFR-SEC-05).
- Hard-coded user-facing strings (NFR-LOC-01).

## Status

Empty on purpose. Code arrives through backlog stories; see `docs/planning/02_Product_Backlog.md`.
