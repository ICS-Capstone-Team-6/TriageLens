# TB model training

Trains the chest X-ray TB model for the M2 slice (story `E2-01`). One TB output ([ADR-14](../../docs/adr/0014-tb-only-output-m2.md)), two backbone candidates judged by [ADR-15](../../docs/adr/0015-interim-bake-off-criteria.md), a pooling and linear head for the class activation map (ADR-9).

**Owner:** Chelsea. Second: Kweku.

## Files

| File | What it does | Needs torch |
| --- | --- | --- |
| `preprocess_spec.json` | The preprocessing steps (`cxr-pre-2`: stretch to 320 x 320, no padding, ADR-16). The app must follow them exactly. | No |
| `preprocess.py` | Reference implementation of the spec | No |
| `prepare_data.py` | Checks every raw file's SHA-256 against the manifest, then saves 320 px arrays per split | No |
| `combine_data.py` | Joins prepared sources (Shenzhen, TBX11K) split by split and tags each image with its source; per-source scoring and sampling helpers | No |
| `metrics.py` | AUROC and 95% bootstrap intervals (TRD 9.8) | No |
| `data.py` | Loads splits, refuses the test split (ML-DATA-04), augmentation without flips (TRD 9.4) | Yes |
| `models.py` | `TBNet`: backbone, pooling, one linear layer, class activation map | Yes |
| `train.py` | One run: head warm-up, full fine-tune, early stopping, shortcut check, run log | Yes |
| `baselines.py` | Baseline ladder: image size only, 64 px pixels, frozen backbone | Yes |
| `plot_curves.py` | Learning curves per run (`curves.png`) and the bake-off comparison | matplotlib |

## Run on Modal

From the repo root, after the raw set is in the `triagelens-data` volume (see `ml/modal/README.md`). Commit first: each run records the commit, and a dirty tree is flagged.

```sh
pip install -r ml/requirements-modal.txt
modal run ml/modal/train_app.py::prepare      # hash check and 320 px arrays (CPU)
modal run ml/modal/train_app.py::baselines    # rungs 0 to 2
modal run ml/modal/train_app.py::bakeoff      # 2 backbones x 3 seeds in parallel
```

`prepare` stops with a hard fail if any raw file is missing or differs from `ml/manifests/shenzhen_v2/manifest.csv` (dataset v2, hash `0445b087fed038c4`; v2 keeps every v1 patient in its v1 split, see `ml/pipeline/README.md`). Bake-offs 1 and 2 ran on v1 (`702a4658c7447e13`).

## What each run records

Every run folder in the `triagelens-runs` volume holds `config.json` (recipe, seed, code commit, dataset version hash, preprocessing version), `history.csv`, `metrics.json`, `curves.png`, `val_predictions.csv` and `best.pt` (Team Rules 7). Download them with `modal volume get --force triagelens-runs /bakeoff ml/runs/` (`--force` because the folder exists after the first download). The test split is never read here. It is used once per frozen candidate (Team Rules 7).

## Reading the curves: over- and underfitting

Each epoch scores the training images twice: with augmentation (the loss the model trains on) and without it (`train_auroc_clean`, `train_loss_clean`). Only the clean numbers compare fairly with validation. `metrics.json` holds `fit.gap`, clean train AUROC minus validation AUROC at the best epoch.

| Pattern in `curves.png` | Meaning | What to try |
| --- | --- | --- |
| Train AUROC near 1, validation well below, gap widening; validation loss turns up | Overfitting | Stronger augmentation, freeze early layers, lower backbone learning rate |
| Both AUROC lines low and close; both losses high and flat | Underfitting | More epochs, higher learning rate, unfreeze more |
| Best epoch is the last epoch (`fit.best_epoch_is_last`) | Still improving when stopped | Raise `epochs_max` |
| Wide spread across the three seeds | Result depends on luck | Report the spread; do not pick the best seed |

## Shape check (ADR-16)

In the Shenzhen set TB images are narrower than normal ones, so image shape predicts the label (aspect ratio alone: validation AUROC about 0.70 in reverse). Preprocessing stretches every image to a square so no padding bars show the shape. Each run's `metrics.json` holds `shape_check`:

| Field | Healthy | Warning sign |
| --- | --- | --- |
| `within_class_corr` (normal, tb) | Near 0 | Stronger than 0.3 either way: the score follows shape |
| `by_aspect_third[].auroc` (or `by_aspect_value` when a set has only a few fixed shapes, as Montgomery) | Close to the overall validation AUROC | More than 0.10 below it inside a group |

Training also stretches width and height independently by up to 15% (`shape_jitter`, default 0.15; 0 turns it off), so apparent chest width stops being a reliable clue. Bake-off 1 ran without it and still showed within-class correlations of -0.26 to -0.53. The bake-off table shows the mean within-class correlation as `shape corr`. Rung 0 in the baselines still scores about 0.80: it measures the dataset, not the model.

**Result (bake-off 2, 18 Oct 2026).** The augmentation changed nothing: shape correlation -0.40 (MobileNetV3) and -0.37 (EfficientNet), as before. Within each class the score follows image texture more strongly (edge energy +0.47 to +0.65), and narrow images are more textured, which explains the shape correlation. Texture may be disease or the provider's processing; Shenzhen alone cannot tell. No further training changes for this: the locked Montgomery external test answers it ([ADR-16](../../docs/adr/0016-stretch-not-pad-preprocessing.md) follow-ups).

## Training on Shenzhen plus TBX11K

The frozen model learned from Shenzhen only. TBX11K adds a second source ([ADR-23](../../docs/adr/0023-tbx11k-without-age-or-patient-ids.md), `ml/manifests/tbx11k_v1/`). Each source is prepared on its own against its own manifest, then the two are joined split by split. Nothing moves between splits, and the test split stays locked.

```sh
# once: only what the pipeline reads, not extra/ (copies of our locked sets) or test/
for d in lists annotations/json imgs/health imgs/sick imgs/tb; do
  modal volume put triagelens-data ml/data/raw/tbx11k/TBX11K/$d /tbx11k/raw/TBX11K/$d
done
modal run ml/modal/train_app.py::prepare_tbx11k
modal run ml/modal/train_app.py::combine
modal run ml/modal/train_app.py::bakeoff --backbones efficientnet_lite0 --data combined
```

Locally: `prepare_data.py --raw ml/data/raw/tbx11k --img-subdir TBX11K/imgs --manifest ml/manifests/tbx11k_v1/manifest.csv`, then `combine_data.py --out <folder> shenzhen=<prepared> tbx11k=<prepared>`, then `train.py --data <folder>`.

**Validation works differently with two sources.** TB is about 50% of Shenzhen and about 11% of TBX11K, so recognising the source alone raises pooled AUROC. Training therefore:

- picks the checkpoint on the **mean of the per-source validation AUROCs** (`selection_metric` in `metrics.json`; `val_auroc` in `history.csv`)
- logs `val_auroc_shenzhen`, `val_auroc_tbx11k` and `val_auroc_pooled` every epoch
- writes `val_by_source` (AUROC with 95% CI and a shape check per source) and `source_check` to `metrics.json`

| Field | Healthy | Warning sign |
| --- | --- | --- |
| `val_by_source.shenzhen.auroc` | Close to the Shenzhen-only bake-off (v2: 0.917 to 0.927 over three seeds, EfficientNet-Lite0) | Clearly lower: TBX11K pulls the model away from Shenzhen |
| `source_check.mean_score_by_source_and_label` | Normal films score alike in both sources | Normal Shenzhen films score far higher than normal TBX11K films: the model reads the source |
| `val_auroc_pooled` against `val_auroc` | Similar | Pooled much higher: a source shortcut |

**Sampling.** `--sampler natural` (default) shuffles all training images. TBX11K is then about 94% of each epoch. `--sampler source_balanced` gives each source half of each epoch, with labels at their natural rate inside each source, so each of the 431 Shenzhen training images repeats about 8 times per epoch. Run both, three seeds each, and compare them on validation only. The choice is an experiment, not a default we already know is right.

The locked sets (Shenzhen held-out, TBX11K test, Montgomery) are still scored once per frozen candidate.

**Result (combined bake-off, 23 Nov 2026).** EfficientNet-Lite0, three seeds per sampler, commit `f99e6e6`, combined data `51d2c6a3f4f73a41`. All numbers are on validation. The locked sets were not touched.

| Run | Shenzhen val AUROC (n = 94, 49 TB) | TBX11K val AUROC (n = 884, 100 TB) | Mean normal score, Shenzhen / TBX11K | Shenzhen shape corr (normal, TB) |
| --- | --- | --- | --- | --- |
| Shenzhen only (v2 bake-off) | 0.922 (sd 0.005) | not measured | n/a | -0.39 (mean of both) |
| Combined, natural | 0.930 (sd 0.006) | 0.996 (sd 0.005) | 0.13 / 0.04 | -0.30, -0.27 |
| Combined, source-balanced | 0.922 (sd 0.009) | 0.994 (sd 0.002) | 0.15 / 0.04 | -0.40, -0.30 |

Seed 1 of the natural run: Shenzhen 0.932 (95% CI 0.874 to 0.976). No run stopped at its last epoch. The best epochs were 14 to 25.

- **Shenzhen barely changes.** +0.008 with the natural sampler is far inside each run's interval (about ±0.05 on 94 images). TBX11K didn't hurt Shenzhen, but it isn't proven to help it either.
- **TBX11K validation is near perfect, and probably optimistic.** The split is by image, not patient (ADR-23), and TBX11K may simply be easier.
- **The source offset remains.** Normal Shenzhen films score about three times higher than normal TBX11K films. A single threshold will act differently on each source, which is the Montgomery sensitivity drop seen before. Only the external test can show whether TBX11K fixes it.
- **Sampler.** Source-balanced sampling is no better and makes the shape correlation slightly worse. Keep `natural`.

**One-time evaluation of the combined candidate (23 Nov 2026).** Run `efficientnet_lite0_seed1_20261123T160548Z`: the natural sampler's median seed, at full precision, with evaluation code `4ce6426`. Each set was scored once (ML-DATA-04). Threshold: 90% sensitivity on combined validation (probability 0.755). Second threshold: 90% sensitivity on Shenzhen validation alone (0.381), the rule the Shenzhen-only model used.

| Set | Shenzhen only (ADR-18 model) AUROC [95% CI] | Combined AUROC [95% CI] | Combined sens / spec at Shenzhen-val threshold |
| --- | --- | --- | --- |
| Shenzhen held-out (93, 47 TB) | 0.978 [0.942, 1.000] | 0.981 [0.950, 1.000] | 0.979 / 0.935 |
| TBX11K test (884, 100 TB) | not scored | 0.997 [0.994, 0.999] | 0.980 / 0.980 |
| **Montgomery, external (127, 57 TB)** | **0.887 [0.830, 0.938]** | **0.734 [0.630, 0.821]** | **0.667 / 0.600** |

- **TBX11K made external results worse.** On the same 127 Montgomery films, the paired bootstrap difference is -0.153 AUROC (95% CI -0.252 to -0.061). The combined model is below the 0.80 floor (TRD 3.4), and its sensitivity is below the 85% floor at both thresholds. The Shenzhen-only model stays the frozen model.
- **Normal Montgomery films look like TB to it.** Their mean TB score is 0.35, against 0.09 under the Shenzhen-only model, and 0.05 to 0.14 for normal films from the training sources.
- **Active TB suffers most.** Montgomery active TB against all normals: AUROC 0.687 (Shenzhen only: 0.908). Inactive or healed: 0.814 (0.850). Women: 0.566. Age 55+: 0.553 (22 films, 17 TB). These are small groups, so treat them as warnings, not estimates.
- **Internal numbers didn't predict this.** Validation and both internal tests went up. A second training source that looks unlike the external set can make generalisation worse, so internal test scores are not enough to choose a model.
- int8 drop: -0.017 on Montgomery, +0.001 on TBX11K, -0.002 on Shenzhen.

Possible causes, not tested: TBX11K's 512 px downsizing and processing differ from the full-resolution US films; TBX11K labels (sick but not TB counted as 0, latent counted as 1) may not match Montgomery's; the model may lean on source-specific texture (H11). Any new candidate needs its own one-time evaluation.

## After the bake-off

ONNX export, int8 and the rule 2 comparison: [`ml/export/README.md`](../export/README.md).

## One-time evaluation of the frozen model

ML-DATA-04: the Shenzhen held-out split (`test`) and Montgomery are scored once per frozen model. `evaluate.py` checks the preprocessing version first, then claims each set with a lock file before reading it and saves its result at once. A retry reuses saved results and never scores a set again; a set claimed by an attempt that died while scoring it is refused, and the gap must be reported. Every attempt is logged.

```sh
modal volume put triagelens-data ml/data/raw/montgomery /montgomery/raw   # once
modal run ml/modal/train_app.py::evaluate        # median seed of the latest bake-off (ADR-18)
modal volume get --force triagelens-runs /eval ml/runs/
python3 ml/train/subgroups.py ml/runs/eval/<run>  # sex, age, active vs inactive TB; runs locally
```

The only operating point uses a threshold set on validation (90% sensitivity). `subgroups.py` reads the git-ignored private metadata on the team's machine and saves counts and rates only. Results for the frozen model: ADR-18, section "Results".

## One-time score on the India sets (after E6-01)

DA and DB are scored once, locally (ADR-24), at the three-zone thresholds that `E6-01` writes to `apps/pwa/public/config/thresholds.json`. `evaluate_external.py` refuses the interim ADR-20 file (`v0-uncalibrated`) and any file written for another run. The cuts are read exactly as the app reads them: on the raw sigmoid scale, with any temperature treated as information only. A temperature is applied only if the file says `probability_space: calibrated` (ADR-27).

```sh
modal volume get triagelens-runs /bakeoff/efficientnet_lite0_seed1_20261021T114608Z ml/runs/frozen/   # once
for s in da db; do
  python3 ml/train/prepare_data.py --raw ml/data/interim/india_tb_v1 --img-subdir images \
    --manifest ml/manifests/india_tb_v1/$s/manifest.csv --out ml/data/processed/india_${s}_v1_cxr-pre-2 --splits external
done
python3 ml/train/evaluate_external.py --check-only   # touches no locked data
python3 ml/train/evaluate_external.py                # ONE time per frozen run (done 25 Nov 2026)
```

For each set, it reports AUROC with its 95% CI and the three zones: TB films in low risk, sensitivity of "not low risk", specificity of "not refer", and the share of Unsure. Results go to `ml/runs/eval/<run>_india/`. The zone code is in `zones.py`, which has no torch dependency, so CI tests it.

**Result (25 Nov 2026), scored once.** Frozen run `efficientnet_lite0_seed1_20261021T114608Z`, fp32, thresholds `v1-calibrated` (screen-out 0.088844, refer 0.901772, raw scale), code at `717ef6f`. DA and DB are now locked for this run. One seed only. Per-film scores stay on the team's machine (ADR-24).

| Item | India DA (156 films, 78 TB) | India DB (114 films, 45 TB) |
| --- | --- | --- |
| AUROC (95% CI) | 0.846 (0.780 to 0.906) | 0.908 (0.851 to 0.957) |
| AUROC with film borders masked | 0.866 | 0.898 |
| TB films in Low risk | 0 | 0 |
| Sensitivity of "not low risk" | 78/78 = 1.000 (95% CI 0.953 to 1.000) | 45/45 = 1.000 (95% CI 0.921 to 1.000) |
| Specificity below refer | 69/78 = 0.885 (95% CI 0.795 to 0.938) | 60/69 = 0.870 (95% CI 0.770 to 0.930) |
| Normal films in Low risk | 3/78 = 0.038 (95% CI 0.013 to 0.107) | 7/69 = 0.101 (95% CI 0.050 to 0.195) |
| Unsure share | 89/156 = 57.1% | 63/114 = 55.3% |
| Zones, TB films (Low, Unsure, Refer) | 0, 23, 55 | 0, 10, 35 |
| Zones, normal films (Low, Unsure, Refer) | 3, 66, 9 | 7, 53, 9 |
| int8 AUROC (drop from fp32) | 0.805 (0.040) | 0.856 (0.052) |

What it shows:

- **No TB film reached Low risk** on either set. The fail-safe goal of `E6-01` held on new data.
- **Ranking:** DB meets the 0.85 TB target (TRD 3.4). DA is above the 0.80 floor but below the 0.90 target. Masking the borders barely moves AUROC, so the borders are not driving the score.
- **Low risk is almost never given.** Only 4% (DA) and 10% (DB) of normal films reach Low risk, and more than half of all films are Unsure, against 43% on Shenzhen validation. Normal films score higher here than on Shenzhen, so specificity below refer also falls, from 0.956 to about 0.87. The result is safe but saves little work. Per-site calibration (H4) is the open fix.
- **Shape:** film shape alone gives AUROC 0.51 (DA) and 0.50 (DB), so there is no shape shortcut (ADR-16). On DA, the 46 non-square films scored AUROC 0.945 and the 110 square films 0.806 (cause not tested).
- **int8:** the drop is 0.040 (DA) and 0.052 (DB). Both are above the 0.03 floor (TRD 3.4), which supports shipping fp32 for now (ADR-18).
- **Limits:** one seed, small sets, wide CIs. DA and DB have no age data, so the age 15 and over rule cannot be checked (ADR-24).

## Calibration and three-zone thresholds (E6-01)

`calibrate.py` runs the frozen model on Shenzhen validation only, fits a temperature, sets both cuts, and writes the app's `apps/pwa/public/config/thresholds.json` ([ADR-27](../../docs/adr/0027-calibration-v1-thresholds.md)). The maths is in `calibration.py`, which has no torch dependency, so CI tests it.

```sh
modal volume get triagelens-runs /bakeoff/efficientnet_lite0_seed1_20261021T114608Z ml/runs/frozen/   # once
python3 ml/train/calibrate.py --check   # compute and print; write nothing
python3 ml/train/calibrate.py           # report + reliability plot in ml/runs/calibration/<run>/, thresholds v1
```

**The rules:**

- **Screen-out:** at least 95% of validation TB films must not be Low risk.
- **Refer:** at least 95% of validation normal films must sit below the refer cut.
- **Cut placement:** each cut sits halfway between two neighbouring validation scores.
- **How the app reads them (`triage.ts`):** probability at or above the refer cut gives Refer now. Probability below the screen-out cut gives Low risk. A tie goes toward refer.
- **Scale:** the cuts are stored on the raw sigmoid scale the app compares against. The temperature and calibrated cuts are stored as information only. Temperature keeps the order of the films, so it never changes a zone.

**Result (24 Nov 2026), frozen run, Shenzhen validation (94 films, 49 TB):**

| Item | Value |
| --- | --- |
| Temperature | 1.343 |
| ECE, 10 bins | 0.098 before, 0.099 after (95% CI 0.075 to 0.181). Target 0.05 missed; floor 0.10 met by the point estimate |
| ECE, 5 bins | 0.085 before, 0.069 after |
| Cuts (raw probability) | screen-out 0.088844, refer 0.901772 |
| Zones | Low risk 29 (2 TB), Unsure 40 (42.6%), Refer now 25 (2 normal). Same as `v0` |
| Sensitivity of "not low risk" | 47/49 = 0.959 (95% CI 0.863 to 0.989) |
| Specificity below refer | 43/45 = 0.956 (95% CI 0.852 to 0.988) |
| Selective prediction (accuracy at a 0.5 cut) | 0.85 on all films; 0.89 with the least certain 20% sent to review; 0.94 with the least certain half sent |

Calibrated probabilities are not shown to health workers (`for_display: false`) until ECE meets the target on a larger validation set.

## Tests

```sh
python3 -m unittest discover -s ml/tests -v                 # CI: torch tests are skipped
pip install -r ml/requirements-train.txt                     # then the torch tests run too
```
