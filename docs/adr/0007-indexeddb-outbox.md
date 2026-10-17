# ADR-7. Offline storage

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-7. Copied from the baseline; wording not changed.

## Context

Offline storage for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

localStorage, IndexedDB, Cache API only

## Decision

**IndexedDB (via a small wrapper) with an outbox**; images encrypted with WebCrypto.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

Quota or eviction problems on target phones.
