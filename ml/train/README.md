# TB model training

Trains the chest X-ray TB model for the M2 slice (story `E2-01`). One TB output ([ADR-14](../../docs/adr/0014-tb-only-output-m2.md)), two backbone candidates judged by [ADR-15](../../docs/adr/0015-interim-bake-off-criteria.md), a pooling and linear head for the class activation map (ADR-9).

**Owner:** Chelsea. Second: Kweku.

## Files

| File | What it does | Needs torch |
| --- | --- | --- |
| `preprocess_spec.json` | The preprocessing steps (`cxr-pre-2`: stretch to 320 x 320, no padding, ADR-16). The app must follow them exactly. | No |
| `preprocess.py` | Reference implementation of the spec | No |
| `prepare_data.py` | Checks every raw file's SHA-256 against the manifest, then saves 320 px arrays per split | No |
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

## Tests

```sh
python3 -m unittest discover -s ml/tests -v                 # CI: torch tests are skipped
pip install -r ml/requirements-train.txt                     # then the torch tests run too
```
