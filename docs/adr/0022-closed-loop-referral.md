# ADR-22. Closed-loop referral between the screening and receiving facility

- **Status:** Proposed
- **Date:** 17 Nov 2026
- **Decided by:** Proposed by Chelsea. Needs team agreement at the G2 review on Fri 20 Nov; Kweku (team lead) decides if there is no agreement (Team Rules 2).
- **Related:** E10-01, E10-02, E15-04, E8-07, E6-02, E9-01, E9-02, E12-02; FR-05, FR-08, FR-09, FR-10, FR-11, FR-13, FR-17; NFR-PRIV-02; [ADR-6](0006-supabase-backend.md), [ADR-7](0007-indexeddb-outbox.md), [ADR-9](0009-class-activation-map.md), [ADR-10](0010-opt-in-image-upload.md); hazards H1, H13 (new), H14 (new)

## Context

Today the app's work ends when it shows **Refer now** and the advice text (TRD 7.2). Nothing records whether the person reached the facility that runs the confirmation test, or what that test showed. Three gaps follow:

1. **Lost referrals.** People flagged at screening can fail to reach testing (distance, cost, a lost paper slip). The app cannot show this or help the health worker follow up. A screening tool only helps if the person reaches confirmation (TRD 3.3: the app does not replace laboratory or clinician confirmation).
2. **No real-world check of the model.** Without test outcomes, nobody can see how often a **Refer now** result was confirmed in practice. External validation (E11-01) uses public sets only.
3. **The receiving clinician sees nothing.** The person best able to read an image and a heatmap (ADR-9) is the clinician at the receiving facility. The baseline shows the heatmap only to the health worker, who is not trained to read it.

The baseline has no Must or Should story for this step. The printable referral slip is a stretch item (E15-04). Clinician review (E10-01) and the admin dashboard (E10-02) are Should items that review the AI result but do not follow the person.

Constraints: feature freeze is Thu 3 Dec (G3). On 17 Nov, `main` holds the M2 thin slice only ([ADR-19](0019-m2-thin-slice-pulled-forward.md)): TB on chest X-ray, with no offline queue, sync, roles or case log yet. Images stay on the phone unless the person consents (ADR-10, FR-13, NFR-PRIV-02). Row-level security limits health workers to their own facility (TRD 11.3).

## Options considered

1. **Keep the baseline.** Advice text only. No new work and no new privacy risk, but referrals stay invisible and the app stops at a coloured zone.
2. **Printable slip only (E15-04, 2 points).** A slip with the result, versions and advice. Cheap and fully offline, but the loop stays open: no outcome comes back and nothing can be followed up.
3. **Closed-loop referral, thin version (about 8 points).** **Refer now** creates a referral record with a short code. The receiving facility looks it up, sees the case and records the outcome. The screening health worker gets a follow-up list. Builds on the existing schema, row-level security and outbox. Costs a swap and adds a cross-facility privacy risk.
4. **Integration with national systems (DHIMS2 / DHIS2) or SMS reminders.** Most useful at scale, but needs outside approvals, accounts and a messaging provider. Not possible before 3 Dec.

## Decision

**Option 3, kept thin.** When the health worker accepts **Refer now**, the app creates a referral that works offline and travels with the person as a code, so the receiving facility can record what happened and the screening facility can see who has not arrived. This closes the most important gap with the backend we already have (ADR-6, ADR-7), and gives the heatmap (ADR-9) a reader who can judge it.

Scope:

- **Referral record (E10-03, new, 3 points).** Created offline on **Refer now** or **Not sure: refer**. Holds the case ID, the receiving facility (picked from a fixed list), a random 8-character code, the date and the status. The QR code holds only the referral code: no name, no result, no image. A slip (screen or print) shows the code, the result zone, the advice, the model and threshold versions, and the reminder "Screening support only. A clinician decides." This absorbs E15-04.
- **Receiving facility lookup and outcome (E10-04, new, 3 points).** A reviewer or health worker at the named facility scans or types the code. They see the zone, the score, the symptoms and the versions. They see the image and the heatmap only if the person consented to upload (ADR-10). They record arrival, then the confirmation test status and result. This reuses the case view from the clinician review screen (E10-01).
- **Follow-up list and referral numbers (E10-05, new, 2 points).** The screening facility sees open referrals, oldest first, with those not arrived after 7 days marked. The admin dashboard (E10-02) adds counts per week and facility: referred, arrived, tested, and confirmed by the test. No patient identifiers.

Engineering rules:

- **Status only moves forward:** created, arrived, tested, closed. Each offline update goes through the outbox as a safe-to-repeat write (FR-08). Two devices that update the same referral cannot move it backwards, so we avoid most sync conflicts without a merge step. Only an admin can reopen a referral, and that is written to the audit log.
- **Row-level security:** a referral is visible to the sending facility and to the named receiving facility only. New RLS tests: facility C cannot read a referral between A and B; the receiving facility cannot read the sender's other cases.
- **Codes:** random, not sequential, unique per referral, and they expire 60 days after creation.
- **Every lookup** and outcome change writes an audit row (FR-17).

Out of scope: SMS or WhatsApp, DHIMS2 / DHIS2, patient-facing reminders, automatic re-screening, and the "heatmap falls outside the lungs, so retake" check (a separate decision if the team wants it).

## Swap (Team Rules 12, swap rule)

The three new stories add about 8 points. Proposed removals of similar size:

- **E8-07 capture guidance overlay (3 points, Should).** Removed. The written capture protocol and the quality gate (E4-02) remain. Usability round 2 then no longer compares retakes with and without the overlay.
- **E15-04 printable slip (2 points, stretch).** Absorbed into E10-03.
- **About 3 to 5 more points** must come out of Sprint 3 or 4. The team picks these at the G2 review. If no cut is agreed, build E10-03 and E10-04 only and leave E10-05 in the icebox.

## Consequences

- **Easier:** the demo shows one person's full journey, from capture to confirmation test. The dashboard can show how often **Refer now** was confirmed at the receiving facility, the first real-world check of the model.
- **Harder:** a new cross-facility data flow. The schema gains a `referrals` table and a `referral_events` table. RLS policies and tests grow (`supabase-rls-sync` skill). The receiving facility needs at least one test account in staging.
- **Privacy and ethics:** a referral links a person's screening to a second facility. Consent wording (FR-13) must say that the receiving facility can see the result, and the image only if they agree to upload. Kweku checks with the ethics pathway (E12-01, E12-02) whether this needs an amendment before any use with real people. Until then, only fake or consented test data.
- **Wording:** the outcome screen records a laboratory or clinician result, not an AI result. Its labels still go through the `triage-safety-review` skill and `scripts/check_wording.py`. The app must never word a referral as a finding about the person.
- **Hazard log:** add H13 "Referral record shown to the wrong facility or person" (mitigation: RLS by named facility, random expiring codes, no identifiers in the QR, audit log). Add H14 "Follow-up list read as proof the person was seen" (mitigation: only the receiving facility can mark arrival; open referrals stay visible until closed).
- **Docs:** new stories go into the backlog through the change log. Add a row to the change log in `docs/planning/04_Team_Rules_and_Requirements.md` (section 15) when this ADR is accepted. Add the decision to `docs/process/decision-log.md`.
- **ADR-9:** unchanged. The heatmap is also shown on the receiving facility screen when an image is available.

## Revisit trigger

Any one of these:

- G2 (Fri 20 Nov) is not passed: the offline capture, result and sync path does not work on the reference phone. Defer this ADR to the icebox.
- An RLS test shows any referral readable outside the sending and receiving facility. Stop until fixed.
- The ethics pathway says cross-facility sharing needs approval that cannot come before 18 Dec. Fall back to option 2 (slip only) for the demo.
- On Mon 30 Nov, a referral created offline cannot yet be looked up and closed at a second facility account on staging. Cut E10-05 and ship E10-03 with E10-04, or fall back to option 2.
