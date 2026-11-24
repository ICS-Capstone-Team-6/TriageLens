# ADR-25. Chest X-ray execution and two-teacher distillation

- **Status:** Proposed
- **Date:** 24 Nov 2026
- **Decided by:** Micheal (proposal). Needs team agreement at the next sprint review. Kweku decides if there is no agreement (Team Rules 2). Chelsea reviews the ML parts for E2-03 and E2-04.
- **Related:** E2-03, E2-04, E5-01, E5-02, E6-01, E8-04, E9-04, E11-01, E11-02; [ADR-4](0004-multi-task-chest-xray.md), ADR-8, ADR-2, ADR-9; TRD 3.1, 3.4, 7.2, 8, 9.3, 9.4, 10.5, 10.6; hazards H1, H4, H11

## Context

The main plan for chest X-ray outputs is [ADR-4](0004-multi-task-chest-xray.md): one multi-task model with a masked loss first, and two separate models only if they are better by more than 0.02 AUROC. **This ADR does not change that plan.** It only covers the case where E2-03 selects two separate models: how the phone runs them, or how they are combined into one deployed model.

The app must run on a low-end Android phone with 2 GB of RAM (TRD 3.1). The budgets are tight:

- p95 inference per model at most 2.5 s (NFR-PERF-01);
- capture to result at most 5 s p95 (NFR-PERF-02);
- peak memory at most 350 MB (NFR-PERF-04);
- first install at most 45 MB (NFR-PERF-06);
- each int8 model at most 15 MB, and total offline footprint at most 60 MB (NFR-SIZE-01).

TRD 10.5 already says to use one thread, the smaller input size and one model at a time on phones with 2 GB or less.

Two suggestions were raised to save memory and compute on these devices:

1. Run the TB and pneumonia models in sequence when an image arrives.
2. Train the TB and pneumonia models separately, then use them as teachers to train one student model that runs on the phone.

The second is a proposal from Micheal, not a change to the main plan. Micheal is training the initial pneumonia model and has discussed the approach with Chelsea. E2-03 owns the multi-task comparison. E2-04 owns teacher-student distillation. At the time of writing, no pneumonia model or distillation pipeline is committed in `main`.

**Session residency is not measured yet.** A model file and a running session are not the same thing. A session is the running form of the model: the parsed graph, the optimized execution plan, the WASM kernels and the memory arenas. Creating a session costs time, and a WASM heap that has grown may not shrink after a session is released. The team must not assume that running models one after another lowers peak memory. E5-01 and E11-02 must measure:

- session creation time with a cold and a warm model cache;
- first-run warm-up time;
- peak memory with one session and with two sessions;
- whether `release()` or a worker restart returns the WASM heap to its earlier level;
- p95 capture-to-result with one model and with two models.

Until those numbers exist, the sequential path is conditional, not accepted.

## Options considered

1. **Sequential execution.** Keep two models. Load one at a time on 2 GB phones and run them one after the other in one worker. It avoids two active sessions and CPU contention, but it does two forward passes and may add session creation time on every case. It does not reduce total compute.
2. **Two teachers, one student.** Train the TB and pneumonia models separately, then train one student on their soft labels. Only the student ships. It gives one model, one session and one forward pass. It adds training runs and a soft-label protocol, and the student may be worse than the teachers.

| Option | Models on the phone | Device work per image | Memory profile | Main cost |
|--------|---------------------|-----------------------|----------------|-----------|
| Sequential | 2 | 2 forward passes, plus session creation if the session is not resident | One active session at a time on 2 GB; peak depends on release and the WASM heap | Device time and session churn |
| Two teachers, one student | 1 | 1 forward pass | One session, one model | Extra training runs and the soft-label protocol |

## Decision

**ADR-4 remains the main plan.** If E2-03 selects the multi-task model, this ADR does not apply and neither option is used.

If E2-03 selects two separate models, the team will use **two-teacher distillation as the preferred path**, for these reasons:

- It gives one model, one session and one forward pass. That is the best memory and on-device time profile of the two options.
- It keeps the `cxr-tb-pneu` interface, the single feature map for the heatmap (ADR-9) and one threshold file.
- It avoids the per-case session creation cost and the WASM heap uncertainty of the sequential path.
- The saving is in on-device time. The extra training time is real and is accepted only if it fits E2-04 and the sprint capacity.

The student is adopted only if all of these hold:

- It is within 0.02 AUROC of the teachers on validation, the existing E2-04 bar.
- It meets the size and latency budgets (TRD 8) and ECE at most 0.05 on validation (the TRD 3.4 target; the floor is 0.10).
- It passes `safety-reviewer` and `ml-auditor` review.
- It is evaluated once on the locked external sets after it is frozen (ML-DATA-04).

If the student is not ready or fails a gate, the fallback is **sequential execution**:

- One worker, one active chest X-ray session at a time on 2 GB phones, never two in parallel.
- Reuse the preprocessed 320 by 320 input across models.
- Count session creation and warm-up in capture-to-result.
- If p95 capture-to-result is over 5 s or peak memory is over 350 MB, stop and escalate. Do not drop a condition silently.

**Fail-safe.** If either model fails to load or run, the case has no zone for that condition. The screen shows Not sure or refer, never Low risk (TRD 7.2, NFR-SAFE-02).

**Session policy.** On 2 GB phones, keep one chest X-ray session resident at a time unless measurement shows both fit. The small gate model may stay resident if measurement shows it fits. Call `release()` if the pinned ONNX Runtime Web version supports it. Test worker restart as the reliable way to reclaim the WASM heap. Record the measured high-water mark, not only the steady state.

## Consequences

- **ADR-4 is unchanged.** This ADR adds a deployment path for the two-model case. It does not replace the multi-task decision.
- **Distillation path:** teachers are training artifacts only. They are not deployed, not counted in the 60 MB footprint and not in the model manifest. The student gets its own temperature and thresholds (E6-01). The model card lists the teachers as provenance and reports student metrics only.
- **Soft-label protocol:** soft labels are generated on the training split only. The student must not train on validation images, or validation stops being clean for calibration and thresholds. If teachers label images they trained on, the student copies their overfitting. Use cross-fitting or a separate distillation split, and write the choice down before training. External sets are never used for soft labels.
- **Sequential path:** two manifests, hashes, signatures, threshold sets and model cards are needed. E8-04, E9-04 and E11-02 must cover two models. The worker needs a session lifecycle policy and a timing report.
- **Measurement:** E5-01 and E11-02 add the session measurements listed in the context. These numbers decide whether the sequential fallback is allowed.
- **Safety:** H1 and H4 stay open. Distillation does not fix domain shift, and the TB teacher's external sensitivity is already 70.2% at the 90% point on Montgomery ([ADR-20](0020-interim-slice-thresholds.md)). No accuracy claim is made until validation and external results exist. H11 still needs failure review.
- **No baseline requirement changes**, so no change-log row is needed. ADR-4 and the TRD budgets stay in force.

## Revisit trigger

- E2-03 selects the multi-task model within 0.02 AUROC: this ADR is not used.
- Measured session creation and peak memory show the sequential path meets the 5 s and 350 MB budgets: the fallback is allowed without further work.
- The student is more than 0.02 AUROC below the teachers, or fails size, latency or ECE: use the sequential fallback or defer to Sprint 4.
- p95 capture-to-result is over 5 s or peak memory is over 350 MB on the reference phone.
- Feature freeze (3 Dec 2026) passes without a validated student: defer the distillation path and record the decision.
- Any change to ADR-4.
