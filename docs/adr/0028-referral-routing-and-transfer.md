# ADR-28. Referral routing: nearest capable facility, case transfer, ambulance request

- **Status:** Proposed (draft)
- **Date:** 25 Nov 2026
- **Decided by:** Proposed by Kweku. Needs team agreement. Kweku (team lead) decides if there is no agreement (Team Rules 2). The service rules table needs sign-off from a clinician before any use outside a demo.
- **Related:** E10-01, E10-02, E15-04; new stories E10-06 to E10-09; FR-08, FR-10, FR-11, FR-13, FR-17; NFR-PRIV-02; TRD 3.3, 7.2, 7.3, 11.3; [ADR-6](0006-supabase-backend.md), [ADR-7](0007-indexeddb-outbox.md), [ADR-9](0009-class-activation-map.md), [ADR-10](0010-opt-in-image-upload.md), [ADR-14](0014-tb-only-output-m2.md); builds on draft [ADR-22 closed-loop referral](https://github.com/ICS-Capstone-Team-6/TriageLens/blob/docs/E10-03-closed-loop-referral-adr/docs/adr/0022-closed-loop-referral.md) (branch only, no PR yet); hazards H14 to H20 (new)

## Context

Draft ADR-22 adds a referral record. The receiving facility looks it up by code and records the outcome. The health worker picks the receiving facility from a fixed list. Three needs go past that:

1. **Which facility?** A referral only helps if the facility can do the next step. That might be a rapid TB test or an eye clinic. The closest facility may not have it. Health workers pick from memory today.
2. **The receiving clinician needs the whole case.** That means the image and the heatmap as well as the zone (ADR-9). ADR-22 shows the image only if the person agreed to upload (ADR-10).
3. **Some people cannot travel on their own.** The health worker may need to ask the receiving facility to send an ambulance.

Constraints:

- The app works offline (ADR-7). Sending needs signal at some point.
- TRD 3.3 says the app is **not for emergencies**. An ambulance request must not turn it into an emergency tool.
- Row-level security keeps each health worker to their own facility (TRD 11.3). The `facilities` table already exists (migration `20261021183250`). It has no location or services yet.
- The chest X-ray model has a TB output only for now (ADR-14). Pneumonia rules below are written but stay off until a pneumonia output exists.
- The team asked that time be set aside for this decision. The swap rule (Team Rules 12) still applies before any of it is scheduled.

## Options considered

1. **Fixed list (ADR-22 as drafted).** Cheap and offline. The worker still has to know who has what.
2. **AI picks the facility.** A model or a language model reads the result and chooses. There is no data to validate it and it needs internet. It also adds a second clinical decision on top of the screening result. It would be easy to read as a diagnosis (TRD 7.3). Rejected.
3. **Rules plus distance, worker confirms.** A fixed table maps the result to the services needed. The app filters facilities by those services, sorts them by distance and shows the top 3. The worker picks one. The rules can be tested, it works offline and a person decides.

## Decision

**Option 3.** It builds on ADR-22: same referral record, same status flow, same outbox.

### 1. Facility directory (E10-06)

- Add `location` (latitude, longitude), `phone`, `opening_hours`, `services` (a list of tags) and `services_confirmed_at` to `facilities`.
- **Source:**
  - For the demo, use fake seed data: about 10 made-up facilities with made-up services, placed near real towns.
  - For later real use, use the [Ghana Health Facilities OpenStreetMap export on HDX](https://data.humdata.org/dataset/hotosm_gha_health_facilities). It is OpenStreetMap data, so it is likely ODbL. Check the licence first (see Consequences).
  - Alternatively, use the [Ghana Open Data health facilities list](https://data.gov.gh/dataset/health-facilities-ghana). A 2020 review lists it as ODbL. That is not confirmed on the portal.
  - Neither source lists equipment. Services stay a team-entered field that each receiving facility keeps up to date.
- The directory is cached on the phone with the app shell, so search works offline. It refreshes on sync.

### 2. Service rules table (E10-06)

This is a versioned file like the thresholds file (TRD 7.2). The code reads it and never hard-codes it. The draft below gives each condition and zone, the services the facility **needs**, the services it should **preferably** have, and the urgency.

**TB, Refer now:**

- Needs: `tb_rapid_test`
- Prefers: `tb_treatment`
- Urgency: within days
- Basis: WHO recommends rapid molecular tests as the first TB test ([WHO Module 3](https://www.paho.org/en/documents/who-consolidated-guidelines-tuberculosis-module-3-diagnosis)).

**TB, Unsure and refer:** same as TB, Refer now. Uncertainty moves toward refer (TRD 7.2).

**Pneumonia, Refer now:**

- Needs: `chest_xray`, `oxygen`
- Prefers: `inpatient`
- Urgency: same day
- Stays off until a pneumonia output exists (ADR-14).

**Referable DR:**

- Needs: `eye_clinic` (eye doctor on site)
- Prefers: `retina_laser` or `retina_injection`
- Urgency: within weeks
- Basis: published systems use 30 to 90 days ([NSW Health](https://www.health.nsw.gov.au/outpatients/referrals/Pages/diabetic-retinopathy.aspx)) or 49 days ([NHS England](https://www.gov.uk/government/publications/diabetic-eye-screening-programme-standards/nhs-diabetic-eye-screening-pathway-standards-from-1st-october-2024-public-facing-guidance-information)). A Ghana timeframe is not verified.

**Retake (quality failure):** no referral. Show retake advice.

- Several conditions at once: a facility must have the needed services for all of them. If none does within reach, the app suggests one referral per condition and the worker decides.
- This table is a **draft for the demo**. It is not a clinical claim. A clinician signs it off and the sign-off is recorded in the file before any real use.

### 3. Matching and ranking (E10-06)

1. Keep the facilities that have every **needed** service.
2. Sort by distance from the phone's location:
   - Offline, use straight-line distance.
   - Online, road travel time may replace it later (out of scope now).
3. Then put facilities open now first, then those with more **preferred** services.
4. Show the top 3. Each card shows the distance, which needed services it has, and when those services were last confirmed.
5. Flag services last confirmed over 90 days ago as "Check by phone first". Show the phone number.
6. The worker picks one or searches the full list. Nothing is sent without that choice.
7. If no facility within 100 km has the needed services, say so. Show the nearest facility that has some of them, with what it is missing.

Only the facility ID and the distance band are saved with the referral. The person's or phone's exact location is not saved.

### 3a. Referral code with the person's initials (E10-03)

The team chose (25 Nov 2026) to start the referral code with the person's initials, so the receiving facility can match the slip to the right person.

- The code is 8 characters. It starts with 0 to 4 initials (the first letter of each name), typed by the health worker. The rest is random, from an alphabet with no look-alike characters.
- The app turns names into initials on the phone. Names are never kept or sent. Letters such as Ɛ and Ɔ become E and O.
- This changes ADR-22, where the code held no personal data. Initials are personal data. They are stored on the referral and shown on the slip.
- With 4 initials, only 4 random characters remain (about 1 million codes per set of initials), so the code is easier to guess for someone who knows the person. Lookup by code must stay limited to the named receiving facility, signed in, with every lookup audited (Phase 3). The team rejected the option of initials plus 8 random characters.
- Consent wording (FR-13) must mention that initials go on the referral.

### 4. Case transfer with image (E10-07)

- At referral, the app asks for consent to share the case with the chosen facility. The consent covers the image and the heatmap. It is separate from the ADR-10 research upload consent.
- With consent, the image is encrypted on the phone (ADR-7) and uploaded to a private storage bucket when there is signal. Only the sending and receiving facility can read it under storage policies, and every read writes an audit row (FR-17). It is deleted 60 days after the referral closes.
- Without consent, the referral still goes with results only (ADR-22). The facility sees "Image not shared".

### 5. Ambulance request (E10-08)

**The app never decides that someone needs an ambulance.** The health worker decides.

- On the referral screen, "This person cannot travel safely on their own" opens an ambulance request. The worker must choose a reason from a short list. They can also add a note.
- The screen tells the worker to call the national ambulance service or the facility in an emergency. It shows the facility's phone number as a tap-to-call button **above** the in-app request. The in-app request supports the call and never replaces it.
- The request goes to the receiving facility's dashboard as a notification: web push on Android, plus an alert on the dashboard. Their staff mark it **Seen**, then **Dispatched** or **Cannot send**, with an estimated time.
- If it is not marked Seen within 10 minutes, the sender gets "Not seen yet: call them". The request stays at the top of the receiving facility's dashboard until it is answered.
- If the phone is offline, the request cannot be sent. The app says so at once and shows the call button. A request is never queued silently in the outbox.

### 6. Dashboards (E10-09, adds to E10-02)

**Sending facility:**

- Outgoing referrals, oldest open first.
- Status of each: sent, seen, arrived, tested, closed (from ADR-22).
- Ambulance request status.
- Referrals not arrived after 7 days are marked.
- The outcome comes back to the health worker who made the referral. This closes the loop, as in ADR-22.

**Receiving facility:**

- Incoming referrals.
- An ambulance queue on top.
- The case view with image and heatmap when shared (reuses E10-01).
- Outcome recording.
- A services editor, so the facility keeps its own services and `services_confirmed_at` up to date.

**Admin (E10-02):** counts per week and facility: referred, arrived, tested, confirmed, and ambulance requests answered within 10 minutes. No patient identifiers.

### Stories (estimates)

- **E10-06**, facility directory, rules table and matching: 5 points
- **E10-07**, case transfer with image and consent: 3 points
- **E10-08**, ambulance request and dispatch: 5 points
- **E10-09**, sending and receiving dashboards: 3 points

These are on top of ADR-22's E10-03 to E10-05, which are about 8 points. The total is about 24 points, close to a full Sprint 3 or 4 for the team. Under the swap rule, the team must name stories of similar size to remove before any of this is scheduled.

## Consequences

**Easier:**

- The demo shows one person's full path: capture, result, choosing a capable nearby facility, the transfer, the receiving review and the outcome back.
- Arrival and test rates give the first real-world check on Refer now.

**Harder:**

- New schema: the facility columns plus `referrals`, `referral_events` and `ambulance_requests`.
- New storage policies.
- More RLS tests (the `supabase-rls-sync` skill). At minimum:
  - facility C cannot read a referral or image between A and B
  - the receiving facility cannot read the sender's other cases
  - only the receiving facility can mark an ambulance request Seen or Dispatched
- Web push needs a service and keys.
- Staging needs at least two facility test accounts.

**Intended use:**

- The ambulance request comes close to emergency use (TRD 3.3). Keep the wording and the call-first layout.
- The intended-use page (`docs/safety/intended-use.md`) must say that the app helps arrange transport the worker has decided on, and does not detect emergencies.

**Privacy and ethics:**

- Sending images to a second facility is new processing. Consent wording (FR-13) changes.
- Kweku checks with the ethics pathway (E12-01) whether this needs an amendment, and checks Ghana's Data Protection Act requirements.
- Until both are cleared, use only fake or consented test data.

**Data licence:**

- Before any real facility data is imported, add it to the licence register (E1-01). If it is ODbL, show the credit "© OpenStreetMap contributors". Share-alike may apply to any facility data we add to it. Fake seed data has no licence issue.

**Wording:**

- Facility cards say "has the service needed", never anything about the person's condition.
- All new strings pass `scripts/check_wording.py` and the `safety-reviewer` agent.

**Hazard log:** add H14 to H20 (below). Draft ADR-22 names its hazards H13 and H14. `main` already uses H13, so ADR-22's two hazards are folded into H14 and H15 here.

**Docs:**

- Add this ADR to `docs/README.md`.
- When it is accepted, add a change-log row in `docs/planning/04_Team_Rules_and_Requirements.md` and add the new stories to the backlog.

## Revisit trigger

Any one of these:

- An RLS or storage test shows a referral, image or ambulance request readable outside the two facilities. Stop until it is fixed.
- The clinician review of the rules table changes a needed service.
- The ethics pathway says cross-facility image sharing cannot be approved before 18 Dec. Fall back to results-only referral (ADR-22).
- In testing, an ambulance request goes unseen for over 10 minutes more than once in 20 tries. Remove the in-app request and keep the call button only.
- Real facility data is imported and its licence terms do not allow our use.
