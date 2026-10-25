# Low-fidelity flows (E8-01)

**Status:** Draft for the interviews and for E8-02/E8-03. These are layout sketches, not visual design. Wording uses only the approved words (TRD 7.3). Icons are proposals to test (NFR-USAB-03 needs colour + icon + text; the TRD does not name icons). Phone frame: 360 x 640 minimum (NFR-COMP-01); touch targets 48 px or more (NFR-USAB-02).

## Tap count: home to capture (NFR-USAB-01: at most 5)

| Tap | Screen | Action |
|-----|--------|--------|
| 1 | 1 Home | Start screening |
| 2 | 2 Age check | Yes, 15 or older |
| 3 | 3 Image type | Chest X-ray |
| 4 | 4 Camera | Take photo |

**Capture happens at tap 4.** The quality check and the result follow automatically, with no extra taps. The upload path is also within the limit: tap 4 **Upload** and tap 5 pick a file. Margin: one tap. Acceptance criterion met on paper; it is measured for real in the usability rounds (E8-08, E8-10).

## Screens

### 1 Home

```text
+----------------------------------+
| TriageLens              [=] menu |
|                                  |
|  +----------------------------+  |
|  |     (+)  Start screening   |  |  <- primary, full width
|  +----------------------------+  |
|                                  |
|  [ Saved cases ]                 |
|                                  |
|  Offline. 3 cases waiting.       |  <- calm sync status (Team Rules 10)
|  Last sync: Mon 10:42 [Sync now] |  <- visible Sync now (TRD 10.5, iOS)
+----------------------------------+
```

### 2 Age check (chest X-ray: 15 and over, TRD 3.3)

```text
+----------------------------------+
| < Back                           |
|  Is the person 15 or older?      |
|                                  |
|  [   Yes, 15 or older   ]        |
|  [   No, under 15       ]        |
+----------------------------------+
```

"No" shows: "This app is not for chest X-rays of people under 15. Follow your usual process." For eye images, the check is "Adult with diabetes?" (TRD 3.3). Asking for the image type first, then the right age check, is an option to test.

### 3 Image type

```text
+----------------------------------+
| < Back                           |
|  What are you checking?          |
|  [ (lungs) Chest X-ray ]         |
|  [ (eye)   Eye photo   ]         |
+----------------------------------+
```

### 4 Camera (FR-01, FR-16)

```text
+----------------------------------+
| < Back            Tilt: OK  (o)  |
| +------------------------------+ |
| |   +----------------------+   | |
| |   |   frame the whole    |   | |  <- frame guide; tilt and glare hints
| |   |   film inside here   |   | |     come with E8-07 (Should)
| |   +----------------------+   | |
| +------------------------------+ |
|  [Upload]     ( O )             |  <- shutter: large target
+----------------------------------+
```

### 5 Checking image / 5b Retake

```text
+----------------------------------+    +----------------------------------+
|                                  |    |  (!) Shiny spot on the right.    |
|     Checking the image...        |    |      Tilt the phone a little.    |
|     [=======      ]              |    |                                  |
|                                  |    |  [     Retake     ]              |
|                                  |    |  [ Cancel ]                      |
+----------------------------------+    +----------------------------------+
```

There is no result and no score on a failed check (FR-03, TRD 7.2). There is one reason from the approved list.

### 6 Result (FR-05, TRD 7.2, 7.3)

```text
+----------------------------------+
|  (->+) REFER NOW            red  |  <- colour + icon + text; contrast 7:1
|  High risk on this scan.         |
|  Refer for a TB confirmation     |
|  test.                           |
|----------------------------------|
|  TB ............ Refer now       |  <- status per condition
|  Pneumonia ..... Low risk        |
|----------------------------------|
|  [ Show heatmap ]  [ Details ]   |  <- details: reviewers only (TRD 7.3)
|  Any of these symptoms?  [ Add ] |  <- can raise, never lower (FR-05)
|  [        Save case        ]     |
|  Screening support only.         |
|  A clinician decides.            |  <- on every result (TRD 7.3)
|  Model cxr 1.0.0 . thresholds v1 |  <- version shown (FR-12)
+----------------------------------+
```

Amber card: `(?) NOT SURE`, "Not sure. Retake the image, or refer." with **Retake** and **Refer** buttons.
Green card: `(v) LOW RISK`, "Low risk on this scan. This does not rule out disease. If symptoms continue, test or refer."
Proposed icons: `(->+)` arrow-to-clinic, `(?)` question mark, `(v)` down-arrow. Avoid a check mark on green, which may read as "all clear" (H1, H2). Test this in the interviews.

### 7 Symptoms (FR-05, E8-05)

```text
+----------------------------------+
|  Symptoms now (tick any):        |
|  [ ] symptom 1   [ ] symptom 2   |
|  [ ] symptom 3   [ ] symptom 4   |
|  [ Done ]                        |
+----------------------------------+
```

The four symptoms are **not named in the TRD**. A likely source is the WHO four-symptom TB screen (the TRD cites WHO screening guidance, reference 1). This is a clinical choice: confirm it with a clinician before E8-05, and record it in an ADR. Do not guess.

### 8 Saved / case log (FR-07, FR-08)

```text
+----------------------------------+
|  Saved. Case ID: K7Q-2F9         |  <- pseudonymous; no names (FR-07)
|  Waiting to sync (offline)       |
|  [ New screening ]  [ Home ]     |
+----------------------------------+
```

The case log lists cases by ID, date and zone, with search by ID (FR-07). Sync status is shown calmly (Team Rules 10).

## Screens for later stories (named here for consistent navigation)

| Screen | Story |
|--------|-------|
| Sign in, PIN unlock | E9-03 |
| Consent before upload | E12-03 |
| Reviewer queue and case review | E10-01 |
| Admin dashboard | E10-02 |
| Heatmap overlay | E6-02 |

## Next

After the interviews: update this file and [user-journeys.md](user-journeys.md), then hand the screen list to E8-02 (PWA shell) and E8-03 (capture screen).
