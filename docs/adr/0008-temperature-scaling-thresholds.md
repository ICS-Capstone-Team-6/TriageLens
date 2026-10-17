# ADR-8. Uncertainty

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-8. Copied from the baseline; wording not changed.

## Context

Uncertainty for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

Calibrated scores with thresholds, MC dropout, deep ensembles

## Decision

**Temperature scaling and two thresholds.** Cheap and explainable.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

Ensembles fit the latency budget.
