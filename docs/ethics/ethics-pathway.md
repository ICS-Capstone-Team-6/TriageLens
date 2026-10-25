# Ethics pathway

**Story:** E12-01 (NFR-SAFE). **Owner:** Kweku. **Support:** Micheal. **Sprint:** 0 (due Fri 23 Oct 2026, gate G0: "ethics route is named and a clinic contact is identified").
**Sources:** TRD 4.6 (D3), 11.4, 12.3, 12.4, 13.4; Team Rules 8, 9; risk R5.

## Acceptance criteria (Backlog E12-01)

- [ ] IRB route named (section 1). Drafted here; becomes final once the university confirms it.
- [ ] Submission checklist (section 4). Drafted here.
- [ ] Contact person at one clinic ([clinic-contacts.md](clinic-contacts.md)). Needs Kweku (D3).

## 1. Review route

| Work | Human subjects? | Route | Source |
|------|-----------------|-------|--------|
| Core build on public datasets and fake data | No | No review needed. Licence register only (E1-01). | TRD 12.3 step 3 |
| UX interviews with 3+ health workers (E8-01, Sprint 0) | Yes | **Ashesi IRB**. Ask first whether short professional-opinion interviews are exempt (section 2). | Team Rules 9.8 |
| Usability rounds 1 and 2 (E8-08 Sprint 3, E8-10 Sprint 4) | Yes | **Ashesi IRB**: approval or exemption before the first session | TRD 12.3 step 2, 13.4 |
| Any work inside a Ghana Health Service facility, or with GHS patient data | Yes | Ashesi IRB **and** Ghana Health Service ethics review | TRD 12.3 step 1 |
| Local retrospective validation (E15-02, stretch) | Yes | Protocol approval, data-sharing agreement, de-identification | TRD 12.3 step 4 |

**Named route: the Ashesi Institutional Review Board** for all human-subject work in the nine weeks (TRD 12.3). The exact committee name, forms and lead times are **not confirmed**. Ask the capstone supervisor or the research office this week (section 4, step 1).

**Recommendation: keep GHS review off the critical path.** Recruit interview and usability participants in their personal or professional capacity (nurses, community health workers, nursing students), not as research conducted inside a GHS facility. Use no patient data. This keeps the work under the university route only. Secondary sources suggest GHS review is separate and can need about two months' notice. That timing is unverified, but it fits risk R5 ("ethics approval is slow") and the TRD rule that ethics work never blocks delivery (TRD 4.2). Confirm this approach with the IRB.

## 2. Timing conflict to resolve this week

E8-01 (interviews) and E12-01 (this route) are both in Sprint 0. Team Rules 9.8 says **human-subject work needs approval before the first session**.

1. On Monday 19 Oct, email the IRB or the supervisor. Ask: "Are 30-minute interviews with health workers about their workflow, with no patient data, no recordings and anonymised notes, exempt from review, or eligible for expedited review?"
2. **If exempt:** record the reply in the evidence log (section 6) and run the E8-01 interviews.
3. **If review is needed:** submit the protocol in section 3 at once. Until approval, do E8-01 as desk research instead: TRD 6 personas and journeys, published literature, and conversations that are not research (no notes about the person, no data collection). Flag E8-01 as at risk at the Tuesday sync, and record a decision in the decision log.

Do not start interviews on the assumption that they are exempt.

## 3. Protocol outline (one submission for all human-subject work)

One protocol covers the E8-01 interviews and both usability rounds, so only one approval is needed.

| Section | Content (from the baseline) |
|---------|-----------------------------|
| Title | TriageLens: workflow interviews and usability evaluation of an offline AI triage app prototype with health workers |
| Investigators | Kweku (lead), Chelsea, Nana Yaw, Micheal; faculty supervisor: TODO |
| Background | Few radiologists and eye specialists outside cities; district clinics take chest X-rays and retinal photos with no one nearby to read them (TRD 2) |
| Aim | (1) Understand screening and referral workflow to design the app (E8-01). (2) Measure usability of the prototype (E8-08, E8-10). |
| Design | (1) Semi-structured interviews, about 30 minutes. (2) Task-based usability tests with think-aloud and the System Usability Scale, 2 rounds (TRD 13.4). |
| Participants | At least 3 for interviews; at least 5 per usability round. Nurses, community health workers or nursing students, aged 18 or over. |
| Recruitment | Through personal and professional networks (D3), not through facility management. Voluntary, with no incentive that could pressure people (TODO: confirm any token of thanks). |
| Procedures | Interviews: guide in `docs/usability/ux-plan/interview-guide.md` (E8-01). Usability: tasks in `docs/usability/test-plan.md`: install, screen one X-ray photo, retake, interpret "Unsure", find a case, sync. |
| Materials | **Public, de-identified sample images only.** No patient data, no real cases (TRD 12.3, Team Rules 8.1). |
| Data collected | Anonymised notes (codes P1, P2 ...), task times and success, SUS answers, quotes. No names in notes. Audio or screen recording only with a separate opt-in (Team Rules 8.6). No face or voice recording without permission. |
| Consent | Written consent (draft: [consent-template.md](consent-template.md)). The right to stop at any time without giving a reason. |
| Risks | Minimal: time, mild discomfort being observed. The prototype is not used on patients. |
| Benefits | No direct benefit; feedback improves the design. |
| Data protection | Ghana Data Protection Act 2012 (Act 843) (TRD 11.4). Notes on team storage only; signed forms kept offline where the IRB approves, never in the public repo. Retention: TODO, per IRB. |
| Dissemination | Capstone report and demo; no identifying details. |
| Timeline | Interviews in Sprint 0 (or as soon as approved). Usability round 1 in Sprint 3 (23 Nov to 3 Dec). Round 2 in Sprint 4 (7 to 18 Dec). |

## 4. Submission checklist

The steps are generic. Items marked **confirm** depend on Ashesi's actual forms, which this setup could not find online.

1. [ ] Confirm the committee name, forms, submission method and turnaround with the supervisor or research office. **Confirm.**
2. [ ] Confirm whether a faculty supervisor must sign or submit for student investigators. **Confirm.**
3. [ ] Confirm whether ethics training (for example an online human-subjects course) is required, and complete it. **Confirm.**
4. [ ] Ask about the interview exemption (section 2).
5. [ ] Fill in the protocol (section 3) on the IRB's form.
6. [ ] Finalise the consent form: session length, team contact, IRB contact, recording opt-ins ([consent-template.md](consent-template.md)).
7. [ ] Attach the interview guide (E8-01) and the usability test script (TRD 13.4; `usability-study-kit` skill).
8. [ ] Attach the recruitment message.
9. [ ] Data management note: what is collected, where it is stored, who can access it, retention and deletion.
10. [ ] Submit. Record the date and reference in the evidence log.
11. [ ] When approved: tick [irb-checklist.md](irb-checklist.md) with evidence, and replace the consent draft with the approved version.

**Deadline thinking:** usability round 1 starts on Mon 23 Nov. Submitting by the end of Sprint 0 (23 Oct) leaves about four weeks. If there is no approval by week 5 (R5 trigger), escalate at the live sync and prepare the fallback in TRD 4.3, assumption A6 (nursing students or community health volunteers, still with consent and approval).

## 5. Data protection notes (TRD 11.4)

- Health information is **special personal data** under Act 843. Before any real patient data is handled, check with the ethics committee and the Data Protection Commission. This prototype plans none.
- Cloud region and cross-border storage are recorded as a decision and reviewed with the ethics committee (TRD 11.4). Add this to the decision log once the Supabase region is chosen (E9-01).

## 6. Evidence log

| Date | What | Evidence (where it is kept) |
|------|------|-----------------------------|
| | Route confirmed with supervisor or research office | |
| | Exemption question asked / answered | |
| | Protocol submitted | |
| | Approval or exemption received | |
| | Clinic contact identified | [clinic-contacts.md](clinic-contacts.md) |
