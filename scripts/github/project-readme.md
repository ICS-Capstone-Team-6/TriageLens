# TriageLens board

Every card is a GitHub issue created from `docs/planning/product_backlog.csv` (baseline v1.0, 15 Oct 2026). Issue titles start with the story ID, for example `[E8-05]`.

## Fields

| Field | Meaning |
|-------|---------|
| Status | Backlog, Ready, In progress (at most 2 per person), In review, Done |
| Sprint | Sprint 0 to Sprint 4, or Icebox |
| Points | Size. One point is about 2.5 hours. Cap: 8 per person per two-week sprint, 4 in Sprint 0 |
| MoSCoW | Must (MVP), Should (cut first if behind), Could (icebox). The template's Priority field is an org-wide issue field and is not used. |
| Epic | Workstream E0 to E14, plus E15 Stretch |
| Owner | Accountable person. Support pairs or reviews |
| Depends on | Story IDs that must finish first |
| Requirement | TRD requirement IDs |
| Start date, Target date | Sprint start and end, for the roadmap (org issue fields, set on each issue) |

## Labels

`priority:*`, `epic:*`, `type:*` (story, spike, ml, safety, docs, bug, blocked), `needs-decision`, `scope-change`, and `cut-candidate` for the nine Should stories in the cut order.

## Rules

- **Swap rule:** adding work means removing work of similar size. New ideas go to the Icebox first.
- **Definition of Done:** Team Rules section 5.2.
- Never delete an issue. Close it with a reason.

## Documents

- [TRD](https://github.com/ICS-Capstone-Team-6/TriageLens/blob/main/docs/planning/01_TRD.md)
- [Product Backlog](https://github.com/ICS-Capstone-Team-6/TriageLens/blob/main/docs/planning/02_Product_Backlog.md)
- [Sprint Plan](https://github.com/ICS-Capstone-Team-6/TriageLens/blob/main/docs/planning/03_Sprint_Plan.md)
- [Team Rules](https://github.com/ICS-Capstone-Team-6/TriageLens/blob/main/docs/planning/04_Team_Rules_and_Requirements.md)
