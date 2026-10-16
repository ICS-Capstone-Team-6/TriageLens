---
paths:
  - "ml/**"
---

# ML discipline

Source: TRD 9.2, 9.4, 9.6, 9.10; Team Rules 5.3, 7. Full protocol: `ml-experiment-protocol` skill.

- Split by patient, never by image. Fixed seed. Commit the manifest to `ml/manifests/`.
- Remove exact and near duplicates; check source overlap before assigning external sets.
- Locked external sets (Montgomery, India TB, VinDr-CXR, Messidor-2, IDRiD, mBRSET): no training, tuning, early stopping or thresholds. Evaluate once per frozen candidate.
- Kermany paediatric set is excluded from training.
- Calibration and thresholds on the validation split only. Store them in a signed, versioned file.
- Three seeds for final numbers; report mean and spread.
- Every run logs config, seed, code commit, data manifest hash and metrics.
- No horizontal flip for chest X-rays.
- Report 95% bootstrap CIs; report weak and negative results too.
- Frozen models are immutable: any change is a new version with full re-validation.
- Never commit datasets, checkpoints or model binaries. Check the shared GPU log before large runs.
