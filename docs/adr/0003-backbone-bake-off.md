# ADR-3. Backbone

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-3. Copied from the baseline; wording not changed.

## Context

Backbone for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

MobileNetV3-Large, EfficientNet-Lite0, MobileNetV2, larger nets

## Decision

**Bake-off in Sprint 1.** Default MobileNetV3-Large with a plain pooling and linear head.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

Latency or accuracy misses the budget.
