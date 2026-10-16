# Claude Code skills and agents

Project-specific skills live in `.claude/skills/` and reviewer agents in `.claude/agents/`. They are shared through git, so every teammate's Claude Code gets them.

- **Auto** skills load when Claude decides they are relevant. If a skill has `paths`, it loads only while working on matching files.
- **Manual** skills run only when you type the slash command.
- **Agents** are read-only reviewers. Ask for them by name, for example "use the safety-reviewer agent on this branch".

All skills cite the TRD and Team Rules sections they enforce. Facts come from the baseline documents only. Where something is not decided yet, the skill says so (for example the reference phone: TBD, decision D2).

## Skills

| Skill | Trigger | Mode | Paths | Owner | Enforces |
|-------|---------|------|-------|-------|----------|
| [triage-safety-review](../../.claude/skills/triage-safety-review/SKILL.md) | Changes to result screens, triage rules, thresholds, wording, consent or age gate | Auto | `apps/pwa/**`, `packages/triage/**` | Kweku | TRD 7.2, 7.3, 12.1, 12.2; NFR-SAFE; Team Rules 9, 11 |
| [ml-experiment-protocol](../../.claude/skills/ml-experiment-protocol/SKILL.md) | Training, splits, evaluation, calibration, thresholds, reporting metrics | Auto | `ml/**` | Chelsea | TRD 9, 13.2, Appendix C; Team Rules 5.3, 7 |
| [onnx-export-quantize-bench](../../.claude/skills/onnx-export-quantize-bench/SKILL.md) | ONNX export, int8 quantization, parity, size, device benchmarks | Auto | none | Nana Yaw, Chelsea | TRD 8, 9.5, 10.6, 13.3; ADR-2, ADR-5 |
| [pwa-offline-first](../../.claude/skills/pwa-offline-first/SKILL.md) | Service worker, IndexedDB, outbox, encryption, workers, COOP/COEP, offline tests | Auto | `apps/pwa/**` | Kweku, Nana Yaw | TRD 10.5, 10.8; NFR-OFFL, NFR-REL, NFR-SEC-02; ADR-7 |
| [supabase-rls-sync](../../.claude/skills/supabase-rls-sync/SKILL.md) | Migrations, RLS policies and tests, seed data, audit log, consent | Auto | `supabase/**` | Nana Yaw, Kweku | TRD 10.7, 10.9, 11; FR-08, FR-09, FR-13, FR-17 |
| [docs-adr-modelcard](../../.claude/skills/docs-adr-modelcard/SKILL.md) | Writing an ADR, model card, hazard entry, benchmark report, sprint review; changing a baseline doc | Auto | none | Kweku | Team Rules 2, 6, 12; TRD 9.10, 12.2 |
| [usability-study-kit](../../.claude/skills/usability-study-kit/SKILL.md) | Planning, running and scoring usability rounds | Auto | none | Kweku | TRD 13.4, 3.4, 12.3; Team Rules 8.6, 9.8, 10 |
| [sprint-ops](../../.claude/skills/sprint-ops/SKILL.md) | `/sprint-ops start N`, `status`, `review N`, `retro N` | Manual | none | Micheal | Sprint Plan 1 to 5; Team Rules 3, 12 |
| [board-sync](../../.claude/skills/board-sync/SKILL.md) | `/board-sync export`, `reconcile`, `add`, `move` | Manual | none | Micheal | Team Rules 12; Backlog 6; Sprint Plan 5 |

## Agents

| Agent | Use it for | Tools | Owner | Enforces |
|-------|-----------|-------|-------|----------|
| [safety-reviewer](../../.claude/agents/safety-reviewer.md) | Reviewing a branch or diff against the hazard log and wording rules before merge | Read-only (Read, Grep, Glob, git diff/log/show) | Kweku | TRD 7.2, 7.3, 12.2; Team Rules 9, 11 |
| [ml-auditor](../../.claude/agents/ml-auditor.md) | Auditing an experiment folder or ML diff for leakage, test-set peeking, missing seeds or logs, model-card gaps | Read-only (Read, Grep, Glob, git, ls) | Chelsea | TRD 9.2 to 9.10; Team Rules 5.3, 7 |

## Using `/sprint-ops`

| When | Command | What it does |
|------|---------|--------------|
| First Monday of a sprint | `/sprint-ops start 1` | Updates "Current sprint" in `CLAUDE.md`, checks the board holds the sprint's stories, checks the 8-point cap (4 in Sprint 0), lists dependencies and order of work |
| Any time mid-sprint | `/sprint-ops status` | Points done vs committed per person; applies the velocity rule (under 26 points means cut Should stories in the cut order); flags WIP over 2 |
| Last Friday, at the review | `/sprint-ops review 1` | Fills `docs/sprints/sprint-01.md` against the exit criteria and gate; proposes a gate decision for Kweku and Micheal |
| Last Friday, at the retro | `/sprint-ops retro 1` | Records keep/stop/start and each person's workload rating; flags any 4 or 5 |

It shows every file change as a diff and waits for approval.

## Using `/board-sync`

| Command | What it does |
|---------|--------------|
| `/board-sync export` | Writes `docs/sprints/board-snapshot-YYYY-MM-DD.csv` from the board |
| `/board-sync reconcile` | Compares the CSV, the issues and the board; reports differences in title, points, priority, sprint and owner |
| `/board-sync add` | Drafts a new story. It goes to the Icebox by default; moving it into a sprint needs a swap of equal points |
| `/board-sync move E8-07 "Sprint 4" "<reason>"` | Changes a story's sprint with a recorded reason, after checking capacity |

`board-sync` never deletes issues or project items. It closes issues with a reason instead, and every write needs your approval. Board: https://github.com/orgs/ICS-Capstone-Team-6/projects/1.

## Changing a skill or agent

Open a pull request like any other change. Keep each `SKILL.md` under 150 lines. Put long reference material in a sibling file. Cite the source section for every rule.
