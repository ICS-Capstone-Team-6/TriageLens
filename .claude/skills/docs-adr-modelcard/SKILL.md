---
name: docs-adr-modelcard
description: How to write TriageLens project documents in the right place and format. Use when creating or updating an ADR, a model card, a hazard-log entry, a device benchmark report, a sprint review, or when someone wants to change a baseline planning document.
allowed-tools: Read, Grep, Glob
---

# Docs, ADRs and model cards

Enforces Team Rules 2 (decisions written down), 6 (documentation), 12 (change control), TRD 9.10, 12.2, 12.5, 13.3.
Supports stories E0-03, E0-04, E2-05, E11-02, E11-03, E12-02, E12-04, E14-02, E14-05.

## Where things live

| Document | Location | Start from |
|----------|----------|------------|
| ADR | `docs/adr/NNNN-short-title.md` | `docs/adr/0000-template.md` |
| Model card | `docs/model-cards/<model>-<version>.md` | `docs/model-cards/TEMPLATE.md` |
| Hazard entry | new row in `docs/safety/hazard-log.md` | existing rows |
| Benchmark report | `docs/benchmarks/YYYY-MM-DD-<device>-<model-version>.md` | `onnx-export-quantize-bench` skill, step 7 |
| Sprint review | `docs/sprints/sprint-0N.md` | the file already exists; use `/sprint-ops review N` |
| Runbook page | `docs/runbook/` | `docs/runbook/README.md` sections |

Add every new document to `docs/README.md` (index, owner, update rule).

## Baseline documents are frozen

`docs/planning/*` is baseline v1.0. Never edit in place. To change a requirement:

1. Write an ADR (below) that states the old and new requirement and the reason.
2. Add a row to the change log in `docs/planning/04_Team_Rules_and_Requirements.md` (section 15): date, change, agreed by. This is the only edit allowed in a planning document.
3. A Must requirement change needs team agreement and the team lead's decision (Team Rules 12). A gate date change needs Kweku and Micheal.

## ADR

- Number: next free 4-digit number after the highest in `docs/adr/`. ADR-1 to ADR-12 are the baseline (TRD 10.3).
- Status: Proposed, then Accepted / Rejected / Superseded by ADR-M. Never rewrite an accepted decision; write a new ADR that supersedes it and update the old one's status line only.
- Required sections: context, options considered, decision, consequences, revisit trigger (measurable).
- Spikes end with an ADR (one-day time-box, TRD 4.2).

## Model card

- One per released model version (TRD 9.10). Fill every section of the template; write "Not measured" rather than leave a gap.
- Every metric names dataset, threshold and 95% CI (Team Rules 7, TRD 12.5). Weak results go next to strong ones.
- Version and hash table must match the signed manifest (TRD 9.10).

## Hazard log entry

- Next ID (H13 and up). Columns: hazard, possible harm, mitigation, owner, status, evidence, sprint to close.
- Status changes need linked evidence (test, report, PR).
- The log is closed or accepted with reasons by E12-04 (Sprint 4).

## Benchmark report

Device model, Android version, Chrome version, RAM, storage; cold start, load time, p50/p95, peak memory, battery over 50 screenings (TRD 13.3). State whether each budget (TRD 8) is met.

## Sprint review

Fill against the exit criteria and gate already in the sprint file. Evidence for every "Met".

## Writing conventions

- Plain language, grade 8 reading level where readers include health workers (NFR-USAB-04). Short sentences.
- No em dashes. Use a full stop, a comma or a colon.
- Cite sources as "(TRD 7.2)", "(Team Rules 5.2)", story IDs as `E8-05`.
- Never use the forbidden product words (diagnosis, positive, negative, healthy, "you do not have") when describing what the app tells a user (TRD 7.3).
- Relative links only; images in `docs/figures/`. Run `python3 scripts/check_links.py` after editing; it must pass.
- No patient data, real case images, secrets or participant names in any document (Team Rules 8).
