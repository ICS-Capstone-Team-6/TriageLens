# Sprint 1: Mon 26 Oct to Fri 6 Nov 2026

Planned content is copied from [Sprint Plan section 3.2](../planning/03_Sprint_Plan.md). The stories per person are listed there. Fill the empty sections during the sprint. Owner: Micheal (project manager).

## Plan (baseline)

- **Dates:** Mon 26 Oct to Fri 6 Nov 2026
- **Goal:** A thin slice on a real phone: capture a chest X-ray photo and get a TB and pneumonia result offline.
- **Commitment:** 32 points, 15 stories.
- **Order of work:** week 1 is ONNX export (Chelsea) and the inference worker skeleton (Micheal) on a stub model. Week 2 swaps in the real model and runs parity and device benchmarks. Capture screen (Kweku) lands before the quality checks (Micheal).

## Exit criteria and gate

**Gate G1 (Fri 6 Nov).**

- Demo on the reference phone: camera or upload, quality check, TB and pneumonia output, fully offline.
- Models export to ONNX and quantize to int8; parity test runs in CI.
- Supabase schema and row-level security are in place and tested.
- DR data is prepared and split; hazard log v1 exists.
- Benchmark harness reports latency and memory on the reference phone.

**Gate checks (Sprint Plan 4):** Offline TB and pneumonia result on the reference phone; parity test in CI; RLS tested; hazard log v1.

Gate decision (team lead and project manager): Pass | Pass with actions | Hold

## Review notes

_Fill at the sprint review (last Friday). Check each exit criterion above against the demo on a real phone._

| Exit criterion | Met? | Evidence |
|----------------|------|----------|
|  |  |  |

## Retro

### Keep

### Stop

### Start

## Workload rating

Each person rates their workload from 1 (too light) to 5 (too heavy). A 4 or 5 triggers a change in the next sprint (Team Rules 3).

| Person | Rating (1 to 5) | Note |
|--------|-----------------|------|
| Kweku | | |
| Chelsea | | |
| Nana Yaw | | |
| Micheal | | |

## Velocity

If the team finishes fewer than 26 points in a two-week sprint, the project manager and team lead move Should stories out (Sprint Plan 1.2).

| Person | Committed | Done | Carried over | Hours recorded |
|--------|-----------|------|--------------|----------------|
| Kweku | 8 | | | |
| Chelsea | 8 | | | |
| Nana Yaw | 8 | | | |
| Micheal | 8 | | | |
| **Team** | | | | |
