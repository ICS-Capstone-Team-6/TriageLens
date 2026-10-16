# ADR-6. Backend

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-6. Copied from the baseline; wording not changed.

## Context

Backend for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

Supabase, custom FastAPI service

## Decision

**Supabase** (Postgres, Auth, Storage, row-level security). Fast to stand up, free tier, built-in row-level security.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

Data residency or regulation needs self-hosting.
