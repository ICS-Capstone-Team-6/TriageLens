# ADR-11. Model signing

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-11. Copied from the baseline; wording not changed.

## Context

Model signing for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

None, ECDSA P-256, Ed25519

## Decision

**ECDSA P-256** with WebCrypto: supported everywhere.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

Ed25519 reaches universal support.
