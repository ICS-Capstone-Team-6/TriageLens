# Hazard log

Living document. Seeded from the initial hazard log in [TRD section 12.2](../planning/01_TRD.md). The hazard, harm, mitigation and owner columns are copied from the baseline. Status, evidence and sprint to close are filled in as work happens.

The hazard log is created in Sprint 1 (E12-02) and closed or accepted in Sprint 4 (E12-04) (TRD 12.2). Owner of this file: Kweku (safety and ethics lead).

**Status values:** Open, Mitigation in progress, Mitigated (evidence linked), Accepted (with reason).

| ID | Hazard | Possible harm | Mitigation | Owner | Status | Evidence | Sprint to close |
|----|--------|---------------|------------|-------|--------|----------|-----------------|
| H1 | Missed TB or DR (false reassurance) | Delayed treatment, spread of infection | Sensitivity-first threshold; "does not rule out disease" wording; symptoms can raise the zone; clinician review; report sensitivity honestly | Kweku, Chelsea | Open | | |
| H2 | Over-reliance on the tool (automation bias) | Worker skips clinical judgment | Reminder on every result; "Unsure" state; training note in the user guide; usability tests check understanding | Kweku | Open | | |
| H3 | Wrong image type or poor image | Meaningless result | Modality gate and quality gate; no result on failure | Micheal | Open | | |
| H4 | Domain shift (different machines, patients, film) | Lower accuracy than reported | External validation; phone-photo testing; clear limits; monitor "Unsure" and agreement rates; pilot only with approval | Chelsea | Open | | |
| H5 | Used on children or out-of-scope patients | Wrong results | Age gate (15 and over); wording; guide | Kweku | Open | | |
| H6 | Data breach | Loss of privacy | Minimization, encryption, row-level security, audit log, incident plan | Nana Yaw | Open | | |
| H7 | Faulty or tampered model update | Silent errors | Signed manifests, staged release, rollback, parity tests | Nana Yaw, Chelsea | Open | | |
| H8 | Colour-only signals misread | Wrong action | Colour plus icon plus text; contrast rules | Kweku | Open | | |
| H9 | Lost cases (crash, storage evicted) | Missed follow-up | Case created at capture; persistent storage; storage warnings; sync status | Nana Yaw | Open | | |
| H10 | Misuse as a diagnostic tool | Overclaiming | Intended-use banner; wording rules; claims review of report and demo | Kweku, Micheal | Open | | |
| H11 | Shortcut learning (model reads markers or text, not disease) | Hidden failure | Dataset audit; photo and external testing; failure review; heatmap sanity checks | Chelsea | Open | | |
| H12 | Biased performance across groups | Unequal care | Subgroup analysis; state missing groups; do not hide gaps | Chelsea | Open | | |

## Adding a hazard

Add a new row with the next ID (H13 and up). Name the harm, the mitigation, the owner and the story that will close it. Link evidence (a test, a report, a PR) when the status changes.
