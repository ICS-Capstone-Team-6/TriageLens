# ADR-4. Chest X-ray outputs

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-4. Copied from the baseline; wording not changed.

## Context

Chest X-ray outputs for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

One multi-task model, two models

## Decision

**Try multi-task with masked loss first.** One forward pass saves time and memory. Fallback to two models if worse by more than 0.02 AUROC.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

Label conflicts between datasets.
