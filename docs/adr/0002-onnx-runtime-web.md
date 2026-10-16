# ADR-2. Inference runtime

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-2. Copied from the baseline; wording not changed.

## Context

Inference runtime for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

ONNX Runtime Web (WebAssembly), TensorFlow.js, WebGPU, TFLite

## Decision

**ONNX Runtime Web, WebAssembly with SIMD, threads when available.** Works on cheap phones without a GPU; supports int8.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

## Revisit trigger

Browser threads blocked; consider single-thread or native.
