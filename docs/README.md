# Documentation index

Every document in `docs/`, who owns it and how it changes.

**Update rules**

- **Baseline (frozen):** do not edit in place. Change a requirement through an ADR in `adr/` plus an entry in the change log of `planning/04_Team_Rules_and_Requirements.md` (Team Rules 12).
- **Living:** update through a pull request with one review (Team Rules 6).
- **Template:** copy it, do not fill it in place. Change the template itself through a pull request.

## AI context

| Document | Description | Owner | Update rule |
|----------|-------------|-------|-------------|
| [ai-context.md](ai-context.md) | Cited digest of the baseline, loaded into every Claude Code session by `CLAUDE.md` | Kweku | Living; update only after an ADR or a decision D1 to D6 |

## Planning (baseline v1.0, 15 Oct 2026)

| Document | Description | Owner | Update rule |
|----------|-------------|-------|-------------|
| [planning/01_TRD.md](planning/01_TRD.md) | Technical requirements: goals, metrics, requirements, ML, architecture, security, safety, QA, risks | Kweku | Baseline |
| [planning/02_Product_Backlog.md](planning/02_Product_Backlog.md) | 63 stories and 10 icebox ideas with priority, points, owner and acceptance criteria; cut order | Kweku | Baseline |
| [planning/03_Sprint_Plan.md](planning/03_Sprint_Plan.md) | Calendar, capacity, per-person sprint plans, gates | Micheal | Baseline |
| [planning/04_Team_Rules_and_Requirements.md](planning/04_Team_Rules_and_Requirements.md) | Decision rights, workload guardrails, Definitions of Ready and Done, code, ML, data and safety rules, change log | Kweku and Micheal | Baseline; change log is appended |
| [planning/product_backlog.csv](planning/product_backlog.csv) | The backlog as data; source for GitHub issues and the board | Micheal | Baseline |

## Figures

| Document | Description | Owner | Update rule |
|----------|-------------|-------|-------------|
| [figures/architecture.png](figures/architecture.png) | System architecture (TRD 10.1) | Kweku | Baseline |
| [figures/roadmap.png](figures/roadmap.png) | Nine-week roadmap (TRD 5.2) | Micheal | Baseline |

## Architecture decisions

| Document | Description | Owner | Update rule |
|----------|-------------|-------|-------------|
| [adr/0000-template.md](adr/0000-template.md) | ADR template | Kweku | Template |
| [adr/0001-pwa-first.md](adr/0001-pwa-first.md) | ADR-1. App type | Kweku | Living (supersede with a new ADR) |
| [adr/0002-onnx-runtime-web.md](adr/0002-onnx-runtime-web.md) | ADR-2. Inference runtime | Kweku | Living (supersede with a new ADR) |
| [adr/0003-backbone-bake-off.md](adr/0003-backbone-bake-off.md) | ADR-3. Backbone | Kweku | Living (supersede with a new ADR) |
| [adr/0004-multi-task-chest-xray.md](adr/0004-multi-task-chest-xray.md) | ADR-4. Chest X-ray outputs | Kweku | Living (supersede with a new ADR) |
| [adr/0005-static-int8.md](adr/0005-static-int8.md) | ADR-5. Compression | Kweku | Living (supersede with a new ADR) |
| [adr/0006-supabase-backend.md](adr/0006-supabase-backend.md) | ADR-6. Backend | Kweku | Living (supersede with a new ADR) |
| [adr/0007-indexeddb-outbox.md](adr/0007-indexeddb-outbox.md) | ADR-7. Offline storage | Kweku | Living (supersede with a new ADR) |
| [adr/0008-temperature-scaling-thresholds.md](adr/0008-temperature-scaling-thresholds.md) | ADR-8. Uncertainty | Kweku | Living (supersede with a new ADR) |
| [adr/0009-class-activation-map.md](adr/0009-class-activation-map.md) | ADR-9. Explanation | Kweku | Living (supersede with a new ADR) |
| [adr/0010-opt-in-image-upload.md](adr/0010-opt-in-image-upload.md) | ADR-10. Image upload | Kweku | Living (supersede with a new ADR) |
| [adr/0011-ecdsa-p256-signing.md](adr/0011-ecdsa-p256-signing.md) | ADR-11. Model signing | Kweku | Living (supersede with a new ADR) |
| [adr/0012-react-typescript-vite.md](adr/0012-react-typescript-vite.md) | ADR-12. Web framework | Kweku | Living (supersede with a new ADR) |

## Safety and ethics

| Document | Description | Owner | Update rule |
|----------|-------------|-------|-------------|
| [safety/intended-use.md](safety/intended-use.md) | Intended-use statement (TRD 3.3) and where it must appear | Kweku | Frozen text; change by ADR |
| [safety/hazard-log.md](safety/hazard-log.md) | Hazards H1 to H12 with status and evidence (TRD 12.2) | Kweku | Living |
| [ethics/ethics-pathway.md](ethics/ethics-pathway.md) | Review route, protocol outline, submission checklist, timing (E12-01) | Kweku | Living |
| [ethics/clinic-contacts.md](ethics/clinic-contacts.md) | Clinic contact log; roles only, no personal details (E12-01) | Kweku | Living |
| [ethics/irb-checklist.md](ethics/irb-checklist.md) | Ethics pathway checklist (TRD 12.3) | Kweku | Living |
| [ethics/consent-template.md](ethics/consent-template.md) | Consent form for usability testers; draft pending Ashesi IRB review | Kweku | Living; IRB wording overrides |

## ML, benchmarks and usability

| Document | Description | Owner | Update rule |
|----------|-------------|-------|-------------|
| [model-cards/TEMPLATE.md](model-cards/TEMPLATE.md) | Model card template (TRD 9.10) | Chelsea | Template |
| [benchmarks/README.md](benchmarks/README.md) | Where device benchmark reports go | Nana Yaw | Living |
| [usability/ux-plan/README.md](usability/ux-plan/README.md) | E8-01 UX plan: interview guide, notes and synthesis templates, user journeys, low-fi flows | Kweku | Living |
| [usability/test-plan.md](usability/test-plan.md) | Usability test plan (TRD 13.4) | Kweku | Living |

## Sprints, operations and process

| Document | Description | Owner | Update rule |
|----------|-------------|-------|-------------|
| [sprints/sprint-00.md](sprints/sprint-00.md) | Sprint 0 plan, gate, review, retro, workload, velocity | Micheal | Living |
| [sprints/sprint-01.md](sprints/sprint-01.md) | Sprint 1 plan, gate, review, retro, workload, velocity | Micheal | Living |
| [sprints/sprint-02.md](sprints/sprint-02.md) | Sprint 2 plan, gate, review, retro, workload, velocity | Micheal | Living |
| [sprints/sprint-03.md](sprints/sprint-03.md) | Sprint 3 plan, gate, review, retro, workload, velocity | Micheal | Living |
| [sprints/sprint-04.md](sprints/sprint-04.md) | Sprint 4 plan, gate, review, retro, workload, velocity | Micheal | Living |
| [sprints/board-snapshot-2026-10-16.csv](sprints/board-snapshot-2026-10-16.csv) | First board snapshot, taken after setup | Micheal | Record |
| [runbook/README.md](runbook/README.md) | Deploy, rollback, keys, model publishing, incidents (placeholders until E14-02) | Nana Yaw | Living |
| [process/README.md](process/README.md) | How the team works with its tools | Micheal | Living |
| [process/claude-code-setup.md](process/claude-code-setup.md) | What Claude Code loads, when, and who updates it | Kweku | Living |
| [process/skills-and-agents.md](process/skills-and-agents.md) | Every Claude Code skill and agent, and how to use /sprint-ops and /board-sync | Kweku | Living |
| [process/onboarding.md](process/onboarding.md) | First-hour guide for new teammates: tools, sign-in, Claude Code, first PR, rhythm, workload rule | Micheal | Living |
| [process/how-we-use-claude-code.md](process/how-we-use-claude-code.md) | Plan mode, citing stories, commands, what never to paste, reviewing AI-written code | Kweku | Living |
| [process/definition-of-ready.md](process/definition-of-ready.md) | Team Rules 5.1 as a checklist | Micheal | Copy of baseline; Team Rules win |
| [process/definition-of-done.md](process/definition-of-done.md) | Team Rules 5.2 and 5.3 as checklists | Micheal | Copy of baseline; Team Rules win |
| [process/decision-log.md](process/decision-log.md) | Open decisions D1 to D6 and other team decisions | Micheal | Living |
| [process/risk-register.md](process/risk-register.md) | Risks R1 to R16 with status; reviewed weekly | Micheal | Living |
| [process/github-board-views.md](process/github-board-views.md) | How to finish the GitHub board views by hand | Micheal | Living |
| [process/setup-report-01-repo.md](process/setup-report-01-repo.md) | Report on the repository setup | Kweku | Record; do not edit after merge |
| [process/setup-report-04-github.md](process/setup-report-04-github.md) | Report on labels, milestones, issues and the board | Kweku | Record; do not edit after merge |
| [process/setup-report-05-hygiene.md](process/setup-report-05-hygiene.md) | Report on templates, CI, wording lint and process docs | Kweku | Record; do not edit after merge |
| [process/setup-report-final.md](process/setup-report-final.md) | Final audit of the whole setup, with the manual to-do list | Kweku | Record; do not edit after merge |

## Folder READMEs

Each folder has a `README.md` with its purpose, owner, and what must not go in it: [planning](planning/README.md), [figures](figures/README.md), [adr](adr/README.md), [safety](safety/README.md), [ethics](ethics/README.md), [model-cards](model-cards/README.md), [benchmarks](benchmarks/README.md), [usability](usability/README.md), [sprints](sprints/README.md), [runbook](runbook/README.md), [process](process/README.md).
