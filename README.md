# TriageLens

AI-assisted triage for district clinics in Ghana and Africa. A trained health worker photographs a chest X-ray or captures a retinal image. The app checks image quality, runs AI models on the phone with no internet, and shows one of three results: **Refer now**, **Unsure: retake or refer**, or **Low risk**. The models screen for tuberculosis (TB) and pneumonia on chest X-rays, and for referable diabetic retinopathy (DR) on retinal images. It is built to run on a low-end Android phone and to sync to the cloud when a connection is available.

This is a capstone project for the Building Intelligent Systems course.

> **Intended use.** TriageLens is a research prototype for **trained health workers** at primary-care and district facilities. It analyses a chest X-ray (people aged 15 and over) or a retinal image (adults with diabetes) and **suggests** a screening result and referral advice. It **does not diagnose**, does not replace laboratory or clinician confirmation, and must not be used for emergencies or as the only basis for a decision. It is not a certified medical device.
>
> Source: [TRD 3.3](docs/planning/01_TRD.md), frozen in [docs/safety/intended-use.md](docs/safety/intended-use.md).

## Status

- **Phase:** Planning complete (baseline v1.0, 15 Oct 2026). Build starts Monday 19 October 2026.
- **Current sprint:** Sprint 0 (19 to 23 Oct 2026). Gate G0 on Fri 23 Oct.
- **Final delivery:** Friday 18 December 2026 (assumption A1, decision D1).
- **Code:** none yet. Folders are scaffolded and empty until backlog stories fill them.

| Gate | Date | Meaning |
|------|------|---------|
| G0 | 23 Oct | Foundations: repo, CI, data, baseline model, plan |
| G1 | 6 Nov | Thin slice: offline TB and pneumonia result on a real phone |
| G2 | 20 Nov | Core product: three conditions, safe outputs, sync and auth |
| G3 | 3 Dec | Proven: external validation, device report, usability round 1, feature freeze |
| G4 | 18 Dec | Delivered: frozen models, report, demo, handover |

Source: [TRD 5.2](docs/planning/01_TRD.md).

## Team and roles

| Person | Role |
|--------|------|
| Kweku | Team lead and product owner; UX and HCI lead; frontend lead; schema and row-level security; DR data and calibration; ethics and safety lead |
| Chelsea | ML lead: data, models, evaluation, photo robustness, model cards |
| Nana Yaw | DevOps and MLOps lead; CI/CD; sync and auth; QA and device benchmarks; release owner |
| Micheal | Project manager and scrum master; inference worker; capture guidance overlay; photo test set; admin dashboard; demo |

Source: [TRD 15.1](docs/planning/01_TRD.md) and [Team Rules 2](docs/planning/04_Team_Rules_and_Requirements.md).

## Repo map

| Folder | What it holds |
|--------|---------------|
| [`apps/pwa/`](apps/pwa/README.md) | React, TypeScript and Vite progressive web app (capture, results, case log, review, admin) |
| [`packages/triage/`](packages/triage/README.md) | Triage rules and wording checks |
| [`packages/quality/`](packages/quality/README.md) | Image quality-gate heuristics |
| [`ml/`](ml/README.md) | Python: data, training, export, evaluation |
| [`ml/manifests/`](ml/manifests/README.md) | Split manifests and data cards |
| [`supabase/`](supabase/README.md) | Migrations, row-level security policies, tests, seed data |
| [`scripts/`](scripts/README.md) | Helper scripts; `scripts/github/` for board automation |
| [`docs/`](docs/README.md) | Planning baseline and living documents |

## Documentation map

The full index, with owners and update rules, is in [docs/README.md](docs/README.md).

**Baseline planning documents (frozen, v1.0)**

- [Technical Requirements Document (TRD)](docs/planning/01_TRD.md): what we build and why, requirements, architecture, safety
- [Product Backlog](docs/planning/02_Product_Backlog.md): every story with priority, points, owner and acceptance criteria
- [Sprint Plan](docs/planning/03_Sprint_Plan.md): dates, gates and per-person plans
- [Team Rules and Requirements](docs/planning/04_Team_Rules_and_Requirements.md): how we work and the quality bar
- [Backlog as CSV](docs/planning/product_backlog.csv)

**Living documents**

- [Architecture decision records](docs/adr/README.md)
- [Intended use](docs/safety/intended-use.md) and [hazard log](docs/safety/hazard-log.md)
- [Ethics checklist](docs/ethics/irb-checklist.md)
- [Model card template](docs/model-cards/TEMPLATE.md)
- [Usability test plan](docs/usability/test-plan.md)
- [Sprint notes](docs/sprints/README.md)
- [Runbook](docs/runbook/README.md)

![System architecture](docs/figures/architecture.png)

## Quick start

TODO. The app, the ML pipeline and the database do not exist yet. Commands are added here when the stories that create them are done (E0-01, E0-02, E8-02, E9-01, E14-05). Until then:

```bash
git clone https://github.com/ICS-Capstone-Team-6/TriageLens.git
cd TriageLens
python3 scripts/check_links.py   # checks that every relative link in the docs resolves
```

## How to contribute

Read the [Team Rules](docs/planning/04_Team_Rules_and_Requirements.md) first. In short:

- Work from a backlog story. Branch from `main` as `type/short-description`; commit as `type: summary`.
- Pull requests are at most about 400 lines, link the story ID, and need one review from a different person.
- A story is done only when it meets the Definition of Done (Team Rules 5.2).
- Use the approved wording. Never write "diagnosis", "positive", "negative", "healthy" or "you do not have" in the product (TRD 7.3).
- No real patient data, datasets, model binaries or secrets go into this repository (Team Rules 6 and 8).
- To change a baseline requirement, write an ADR in `docs/adr/` and add a line to the Team Rules change log.
