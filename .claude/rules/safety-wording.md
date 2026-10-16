---
paths:
  - "apps/pwa/**"
  - "packages/triage/**"
---

# Safety wording and zone rules

Source: TRD 7.2, 7.3, FR-05; Team Rules 9. Full checklist: `triage-safety-review` skill.

- Forbidden in user-facing text: diagnosis, positive, negative, healthy, "you do not have", "no disease".
- Allowed: high risk, low risk, refer, not sure, retake.
- Every result screen shows: "Screening support only. A clinician decides."
- Zone messages (exact baseline text):
  - Refer now, TB: "High risk on this scan. Refer for a TB confirmation test."
  - Refer now, pneumonia: "Possible pneumonia. Assess the patient and refer per protocol."
  - Refer now, DR: "Possible serious eye disease from diabetes. Refer to an eye clinic."
  - Unsure: "Not sure. Retake the image, or refer."
  - Low risk: "Low risk on this scan. This does not rule out disease. If symptoms continue, test or refer."
- Case zone is the worst condition zone. A failed quality or modality gate shows no zone, only a retake reason.
- Uncertainty never moves toward Low risk. Symptoms raise a zone, never lower it.
- Chest X-ray results only for age 15 and over.
- Thresholds come from the signed calibration file, never literals in code.
- Colour plus icon plus text for every zone. Raw probabilities only in the reviewer details panel.
- Strings externalized; grade 8 reading level.
