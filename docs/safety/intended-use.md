# Intended use

Copied word for word from [TRD section 3.3](../planning/01_TRD.md), which was frozen in Sprint 0 (story E0-04). Changing it needs an ADR and a change-log entry (Team Rules 12).

> TriageLens is a research prototype for **trained health workers** at primary-care and district facilities. It analyses a chest X-ray (people aged 15 and over) or a retinal image (adults with diabetes) and **suggests** a screening result and referral advice. It **does not diagnose**, does not replace laboratory or clinician confirmation, and must not be used for emergencies or as the only basis for a decision. It is not a certified medical device.

## Where it must appear

- Every result screen carries the short reminder: "Screening support only. A clinician decides." (TRD 7.3, NFR-SAFE-01)
- The report and the app say who the tool is for, who it is not for (children), and where the data comes from (Team Rules 9.5).
- The demo uses public or fake data only, and says so on screen (TRD 12.5).

## Out of scope

Copied from TRD 3.2 and 4.5:

- Replacing radiologists, eye specialists or laboratory confirmation.
- Diagnosing individual patients or recommending treatment.
- Children's X-rays (the TB and pneumonia models are for people aged 15 and over in this version).
- Treatment advice and any "diagnosis" wording.

## Related

- [Hazard log](hazard-log.md): H2 (over-reliance), H5 (out-of-scope patients), H10 (misuse as a diagnostic tool).
