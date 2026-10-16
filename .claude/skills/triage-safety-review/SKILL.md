---
name: triage-safety-review
description: Safety review for any change to result screens, triage rules, zone thresholds, user-facing wording, consent screens or age gating in TriageLens. Use when editing or reviewing code under apps/pwa or packages/triage that decides or displays a risk zone, advice text, symptoms, the intended-use reminder, or model/threshold versions. Produces a pass/fail checklist and the test cases the change needs.
paths:
  - "apps/pwa/**"
  - "packages/triage/**"
allowed-tools: Read, Grep, Glob
---

# Triage safety review

Enforces TRD 7.2, 7.3, 12.1, 12.2, NFR-SAFE-01 to 03, NFR-USAB-03, FR-05, FR-13, and Team Rules 9 and 11.
Supports stories E0-04, E6-01, E8-05, E8-09, E12-02, E12-03, E12-04.

Do not invent clinical facts. If a threshold value, message or rule is not in the TRD, say "not specified in the baseline" and ask.

## Steps

1. Read the diff, or the files named by the user, in full.
2. Grep the changed files for every forbidden word below (case-insensitive, whole word).
3. Walk the checklist. Mark each line PASS, FAIL or N/A, with file:line evidence.
4. List required test cases (section "Tests to require").
5. List hazard-log rows (`docs/safety/hazard-log.md`) whose status or evidence should change.
6. Verdict: BLOCK if any FAIL; otherwise PASS.

## Wording (TRD 7.3, Team Rules 9.1)

- Forbidden in any user-facing string: `diagnosis`, `positive`, `negative`, `healthy`, `you do not have`. Also "no disease" (FR-05).
- Allowed: "high risk", "low risk", "refer", "not sure", "retake".
- Every result screen shows: "Screening support only. A clinician decides." (TRD 7.3)
- Raw probabilities appear only in a reviewer "details" panel (TRD 7.3).
- Reading level grade 8 or lower (NFR-USAB-04). Strings externalized, not hard-coded (NFR-LOC-01).

## Zones (TRD 7.2)

| Zone | Rule per condition | Message (exact baseline text) |
|------|--------------------|-------------------------------|
| Refer now (red) | score at or above refer threshold | TB: "High risk on this scan. Refer for a TB confirmation test." Pneumonia: "Possible pneumonia. Assess the patient and refer per protocol." DR: "Possible serious eye disease from diabetes. Refer to an eye clinic." |
| Unsure (amber) | between thresholds, OR borderline image, OR symptoms contradict a low score | "Not sure. Retake the image, or refer." |
| Low risk (green) | at or below screen-out threshold AND quality good AND no symptoms raising the zone | "Low risk on this scan. This does not rule out disease. If symptoms continue, test or refer." |

## Checklist

- [ ] No forbidden word in any user-facing string or string file.
- [ ] Case-level zone is the **worst** of the condition zones (TRD 7.2).
- [ ] A failed quality or modality gate produces **no zone at all** (TRD 7.2, FR-03, Team Rules 11).
- [ ] Uncertainty (borderline image, between thresholds, missing input) moves toward Unsure/Refer or Retake, never toward Low risk (NFR-SAFE-02).
- [ ] Symptoms can raise a zone and can never lower it (FR-05, E8-05).
- [ ] Age gate: chest X-ray flow requires age 15 or over before a result (TRD 3.3, H5).
- [ ] Thresholds and temperatures are read from the signed, versioned calibration file, not literals in code (ML-CALIB-03).
- [ ] Every result stores model version, threshold version and quality scores (NFR-SAFE-03).
- [ ] Result screen shows model version (FR-12 version display is MUST).
- [ ] Each zone uses colour **and** icon **and** text (NFR-USAB-03, H8); zone message contrast at least 7:1; touch targets at least 48 px (NFR-USAB-02).
- [ ] Intended-use reminder present on every result screen (NFR-SAFE-01, H2, H10).
- [ ] Consent recorded before any upload; images not uploaded by default (FR-13, NFR-PRIV-02).
- [ ] No patient identifiers added (names, phone numbers, national IDs, birth dates) (NFR-PRIV-01).

## Tests to require

Ask for these as unit or property tests in `packages/triage` (target at least 70% coverage, NFR-MAINT-01):

- Each forbidden word in a string file fails the wording lint (TRD 13.2).
- Property test: for any input, adding uncertainty never moves the zone toward Low risk (TRD 13.2).
- Property test: adding any symptom never lowers the zone.
- Worst-of rule: one condition Refer plus others Low gives Refer.
- Gate fail gives no zone and a retake reason from the approved list.
- Age under 15 on the chest X-ray flow gives no result.
- Score exactly at each threshold lands in the documented zone.
- Result record contains model version, thresholds version and quality scores.

## Hazard log

If the change mitigates or affects H1, H2, H3, H5, H8 or H10, say which row to update and what evidence to link. Owner of the log: Kweku.

## Output format

```
Verdict: PASS | BLOCK
| # | Check | Result | Evidence |
Tests to add: ...
Hazard log updates: ...
```
