# Reference: phone-photo protocol and simulation requirements

## Capture protocol (TRD Appendix C, summary in TRD 7.4)

**Goal.** Make photos good enough to screen, and consistent enough to test.

Setup:

1. Uniform light box, or a monitor at medium brightness with the screen cleaned. Dim the room; avoid windows and ceiling lights behind the phone.
2. Film flat. Mask extra light around the film edges.
3. Phone parallel to the film at 30 to 40 cm. Use a stand or a stack of books.
4. Flash off. Lock focus and exposure by tapping the lung area, where the phone offers it.
5. Whole film in frame with a small border. Avoid tilt.

Take two shots per film. Keep the better one.

Team photo test set (E1-05, ML-ROBUST-02):

- Record per photo: source image ID (public dataset), label, phone model, distance, light source, glare notes.
- At least two phones and at least two lighting setups. 300 or more photos of distinct X-rays.
- Public, de-identified images only. No patient data.
- A second person spot-checks at least 10% of photos; more than 10% unusable means redo (R15).
- Keep the set on team storage only; never post publicly (dataset licences).

## Simulation library (ML-ROBUST, TRD 9.7; E7-01, E7-02)

| ID | Requirement |
|----|-------------|
| ML-ROBUST-01 | Simulation library for glare, tilt, moire, blur, uneven lighting, compression and cropping, **with unit tests**. |
| ML-ROBUST-02 | Real test set of 300 or more phone photos of displayed or printed X-rays on at least two phones. |
| ML-ROBUST-03 | Ablation: train on clean only, and on clean plus simulated; evaluate on clean, simulated and real photos. |
| ML-ROBUST-04 | Also evaluate on CheXphoto. |
| ML-ROBUST-05 | Report AUROC drop on real photos; target at most 0.05 (floor 0.10, TRD 3.4). |

Unit tests for each transform should check: output shape and dtype unchanged; deterministic under a fixed seed; parameter at zero strength returns the input (within tolerance); visible effect at full strength.

Training augmentation (TRD 9.4) adds: brightness and contrast, rotation up to 10 degrees, scale, noise, JPEG compression. **No horizontal flip for chest X-rays.**

## Ablation table layout (E7-02)

| Trained on | Clean test | Simulated test | Real photo test | CheXphoto | Drop on real |
|------------|-----------|----------------|-----------------|-----------|--------------|
| Clean only | | | | | |
| Clean + simulated | | | | | |

Report AUROC with 95% CI in each cell.
