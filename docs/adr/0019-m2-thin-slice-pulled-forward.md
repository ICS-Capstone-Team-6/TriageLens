# ADR-19. Deploy a thin vertical slice for the M2 course milestone

- **Status:** Proposed
- **Date:** 21 Oct 2026
- **Decided by:** Kweku (team lead). Needs team agreement at the G0 review on Fri 23 Oct (Team Rules 2).
- **Related:** E8-02, E8-03, E8-04, E8-05, E9-01, E13-01, E5-01, E3-01; TRD 3.4, 7.2, 7.3; hazards H1, H4, H11; [ADR-20](0020-interim-slice-thresholds.md)

## Context

The baseline plan puts the first thin slice at gate G1 (Fri 6 Nov, Sprint Plan 1). The ICS 591 Prosit 2 brief, which the plan did not account for, makes milestone M2 due at the Week 7 presentation on **Fri 23 Oct 2026**. M2 requires one path running end to end in its real deployment environment, with live monitoring hooks that have already reported data. A slice that runs only on a laptop scores low on the deployed-slice criterion (C3, 20%), and the monitoring criterion (C4) is another 15%.

What exists today: a validated Shenzhen data pipeline, a trained and exported TB model (frozen run `efficientnet_lite0_seed1_20261021T114608Z`, fp32 ONNX, 12.8 MB, proposed ADR-18) and the UX plan (E8-01). No app code exists.

## Options considered

1. Keep the plan and present M2 from notebooks and the canvas. No scope change, but it fails the "deployed" requirement.
2. Pull a thin version of the Sprint 1 slice into Sprint 0 and deploy it on Thursday 22 Oct. It meets M2, but breaks the Sprint 0 capacity cap (4 points per person) and the swap rule.
3. Ask the course for a later M2 date. Unlikely to be granted, and it leaves the slice risk unchanged.

## Decision

Option 2. One path, deployed on Vercel by Nana Yaw (`apps/pwa`):

- sign-in with a team account and the clinic assigned by Nana Yaw, using the existing Supabase backend (`supabase/TEAM_HANDOFF.md`);
- the person's age band, asked for every screening; Under 15 stops the flow (TRD 3.2, hazard H5);
- a chest X-ray photo or upload, a basic quality check (quality v1: size, blank, too dark, colourful photo), and preprocessing `cxr-pre-2`, ported from Pillow and tested byte for byte against it;
- the frozen TB model running on the phone through ONNX Runtime Web;
- a Refer now, Not sure or Low risk result with the TRD 7.2 wording, icon, colour and the reminder "Screening support only. A clinician decides." (TRD 7.3);
- a numbers-only record through `save_case` and `append_inference`: model, threshold and preprocessing versions, input statistics, score, zone and timing. Never the image.

Left out on purpose: pneumonia, the eye check, roles and admin screens, the offline queue and sync, the case log, symptoms, heatmaps and the learned modality gate.

The slice builds thin versions of E8-02, E8-03, E8-04, E8-05 (no symptoms), E9-01 (one monitoring table) and E13-01. Those stories stay in Sprint 1 and are finished there. Work done now counts toward them, so Sprint 1 is not planned twice.

## Consequences

- Sprint 0 goes over the 4-point cap this week. The swap rule is not met. This is accepted for a fixed external deadline and must not become a habit (Team Rules 3).
- The slice ships thresholds before calibration (E6-01). [ADR-20](0020-interim-slice-thresholds.md) records the interim rule.
- Until the Shenzhen licence terms are confirmed (blocker on PR #78), the deployed address stays unlisted and `noindex`, and only signed-in team accounts can screen.
- **No learned modality gate (H3).** Quality v1 rejects colourful photos, but a grey image that is not a chest X-ray can still get a zone. Accepted for a signed-in team demo only; the TRD 10.6 gate model (E3-01) closes it before any wider use.
- The monitoring table holds no images, names or patient IDs. It is results-only, as ADR-10 requires by default.
- Every result screen shows the model, threshold and preprocessing versions (TRD FR-12).
- Change-log entry in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Revisit trigger

The slice is not running on a real phone by Thu 22 Oct midday, or the G0 review rejects the scope change.
