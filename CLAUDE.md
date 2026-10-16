# TriageLens

Offline-first PWA that runs AI on a low-end Android phone to triage tuberculosis and pneumonia (chest X-ray) and referable diabetic retinopathy (retinal image) for district clinics in Ghana. Four-person, nine-week capstone. It is a research prototype for screening support only, never a diagnosis.

@docs/ai-context.md

## Repo map

- `apps/pwa/`: React + TypeScript + Vite PWA (capture, results, case log, review, admin). Empty until E8-02.
- `packages/triage/`: triage rules and wording checks. `packages/quality/`: image quality-gate heuristics.
- `ml/`: Python data, training, export, evaluation. `ml/manifests/`: split manifests and data cards.
- `supabase/`: migrations, RLS policies, RLS tests, fake seed data.
- `scripts/`: repo helpers (`check_links.py`); `scripts/github/`: board automation.
- `docs/planning/`: frozen baseline. `docs/{adr,safety,ethics,model-cards,benchmarks,usability,sprints,runbook,process}/`: living docs. Index: `docs/README.md`.
- `.claude/skills/`, `.claude/agents/`, `.claude/rules/`: Claude Code configuration.

## Commands

- Docs link check: `python3 scripts/check_links.py`
- Wording lint (forbidden result words in UI strings): `python3 scripts/check_wording.py`
- Script tests: `python3 -m unittest discover -s scripts/tests` and `python3 .claude/skills/usability-study-kit/test_sus.py`
- Markdown lint: `npx markdownlint-cli2 "**/*.md"`
- Dev server: TODO (E8-02)
- Unit tests: TODO (E0-02)
- Lint: TODO (E0-02)
- Type-check: TODO (E0-02)
- Build: TODO (E8-02)
- ML train / eval / export: TODO (E2-01, E5-02)
- Offline end-to-end tests: TODO (E13-02)

## Non-negotiable rules

1. Never use: diagnosis, positive, negative, healthy, "you do not have". Allowed: high risk, low risk, refer, not sure, retake.
2. Uncertainty moves toward refer or retake, never toward reassurance. Symptoms can raise a zone, never lower it.
3. No real patient data in the repo, chat, dev or preview. Datasets and model binaries are never committed.
4. External and test sets are touched once per frozen candidate. Thresholds and calibration come from validation data only.
5. Every result stores model version, threshold version and quality scores.
6. Baseline planning docs are frozen. Change requirements through an ADR plus a change-log entry.
7. Scope changes use the swap rule: add one story, remove one of similar size.
8. Respect the weekly capacity caps; never plan or suggest weekend work.

## Workflow

- Work from a backlog story ID (E#-##). Branch `type/E8-05-short-name`. PR title `[E8-05] summary`. One review minimum; CI green; main is protected.
- Definition of Done: docs/planning/04_Team_Rules_and_Requirements.md section 5.2.
- Board: https://github.com/orgs/ICS-Capstone-Team-6/projects/1 . Issues mirror docs/planning/product_backlog.csv. Use /board-sync and /sprint-ops.
- Current sprint: Sprint 0 (19 to 23 Oct 2026). Updated by `/sprint-ops start N`.

## Read on demand (do not load everything)

- Requirements and ADRs: docs/planning/01_TRD.md
- What to build and acceptance criteria: docs/planning/02_Product_Backlog.md
- Dates, gates, per-person plan: docs/planning/03_Sprint_Plan.md
- Team rules: docs/planning/04_Team_Rules_and_Requirements.md
- Hazards: docs/safety/hazard-log.md

## Skills and rules

Skills live in .claude/skills (see docs/process/skills-and-agents.md). Scoped rules live in .claude/rules. Use the `safety-reviewer` agent before merging result-screen or triage changes, and `ml-auditor` before freezing a model.

## When unsure

Ask. Never guess clinical claims, thresholds or dataset licences. Say what you could not verify.
