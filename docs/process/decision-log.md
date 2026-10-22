# Decision log

Open decisions from [TRD section 4.6](../planning/01_TRD.md), to be answered in Sprint 0. If nobody answers by **Friday 23 Oct 2026**, the default applies. Owner of this file: Micheal (project manager). Large or hard-to-undo decisions also get an ADR in `docs/adr/` (Team Rules 2).

When a decision is made: fill in Answer, Decided by and Date, set Status to Decided, and tell Claude Code to remember it (see [how-we-use-claude-code.md](how-we-use-claude-code.md)). If the answer changes a baseline fact (for example a date), write an ADR and add a row to the Team Rules change log.

| ID | Decision | Owner | Due | Default if unanswered | Status | Answer | Decided by | Date |
|----|----------|-------|-----|-----------------------|--------|--------|------------|------|
| D1 | What is the real submission and demo date? | Kweku | 23 Oct 2026 | 18 December 2026 | Open | | | |
| D2 | Which phone is the reference device? | Nana Yaw | 23 Oct 2026 | Cheapest Android phone a team member owns | Open | | | |
| D3 | Do we have a clinic or nurse contact for interviews? | Kweku | 23 Oct 2026 | Kweku asks through personal network (E12-01) | Open | | | |
| D4 | Which GPU source do we use? | Chelsea | 23 Oct 2026 | Kaggle plus Colab; Chelsea owns the account list | Open | | | |
| D5 | Final product name. | Kweku | 23 Oct 2026 | TriageLens | Open | | | |
| D6 | Is any member away for exams or assignments in the nine weeks? | Micheal | 23 Oct 2026 | Micheal collects dates in Sprint 0 and updates the plan | Open | | | |

Owners: the TRD names an owner in the defaults for D3 (Kweku), D4 (Chelsea) and D6 (Micheal). D1 and D5 sit with the team lead, who decides scope (Team Rules 2). D2 sits with Nana Yaw, who owns the benchmark harness and reference phone (E5-01).

## Other decisions

| Date | Decision | Decided by | Record |
|------|----------|------------|--------|
| 16 Oct 2026 | Use the org project `ICS-Capstone-Team-6/projects/1` as the board | Kweku | [setup-report-04-github.md](setup-report-04-github.md) |
| 16 Oct 2026 | MoSCoW priority in its own board field; org Priority issue field not used | Kweku | [setup-report-04-github.md](setup-report-04-github.md) |
| 21 Oct 2026 | Required pull-request approval removed from `main` branch protection; the four CI checks, admin enforcement and conversation resolution stay on | Kweku | Team Rules change log (pending team agreement) |
| 21 Oct 2026 | Build and deploy a thin vertical slice (TB on chest X-ray, on the phone, with monitoring) for the M2 demo on Fri 23 Oct; Nana Yaw deploys it | Kweku | [ADR-19](../adr/0019-m2-thin-slice-pulled-forward.md) |
| 21 Oct 2026 | Slice ships the frozen run `efficientnet_lite0_seed1_20261021T114608Z` (fp32 ONNX, 12.8 MB) | Chelsea | Proposed ADR-18 (PR #83, #84) |
| 21 Oct 2026 | Screen-out threshold at 95% or higher sensitivity on validation (stricter than the TRD's 90%) | Kweku | [ADR-20](../adr/0020-interim-slice-thresholds.md) |
| 21 Oct 2026 | Refer threshold at 95% or higher specificity on validation | Kweku | [ADR-20](../adr/0020-interim-slice-thresholds.md) |
| 21 Oct 2026 | Slice thresholds use raw (uncalibrated) logits; temperature scaling and new thresholds come in E6-01 | Kweku | [ADR-20](../adr/0020-interim-slice-thresholds.md) |
| 21 Oct 2026 | Chelsea computes the slice thresholds; Kweku wires them into the slice | Kweku | [ADR-20](../adr/0020-interim-slice-thresholds.md) |
| 21 Oct 2026 | Visual style: Impilo-style violet and cyan on a white background, Manrope font; result zones keep red, amber and green with icon and text (TRD 7.3) | Kweku | [M2 slice canvas](https://claude.ai/artifact/XLr6FSeb2ZJyjHxE8vSiJn) |
