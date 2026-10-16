# ADR-9. Explanation

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-9. Copied from the baseline; wording not changed.

## Context

Explanation for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

Class activation map, gradient-based maps

## Decision

**Class activation map** from the final feature map; computed in the browser with no gradients.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

Maps fail the sanity check.
