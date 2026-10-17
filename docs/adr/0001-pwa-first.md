# ADR-1. App type

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-1. Copied from the baseline; wording not changed.

## Context

App type for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

PWA, native Android, Flutter, React Native

## Decision

**PWA first.** No app store, one codebase, fastest to build, offline via service worker, fits team skills.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

p95 latency over 4 s on the reference phone: build the native comparison (E15-07).
