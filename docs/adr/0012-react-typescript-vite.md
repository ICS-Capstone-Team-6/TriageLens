# ADR-12. Web framework

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-12. Copied from the baseline; wording not changed.

## Context

Web framework for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

React with Vite, Next.js

## Decision

**React, TypeScript and Vite** as a static PWA: smaller bundle, no server rendering needed.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

A server-rendered admin app is needed.
