"""Modal entry points for TB model training (story E2-01; ADR-13, ADR-14, ADR-15).

Run from the repo root, in this order:

    modal run ml/modal/train_app.py::prepare      # check hashes, build 320 px arrays (CPU)
    modal run ml/modal/train_app.py::baselines    # baseline ladder, rungs 0 to 2 (GPU)
    modal run ml/modal/train_app.py::bakeoff      # 2 backbones x 3 seeds (GPU, in parallel)
    modal run ml/modal/train_app.py::train_one --backbone mobilenetv3_large --seed 1
    modal run ml/modal/train_app.py::export       # ONNX and static int8 for the latest bake-off (CPU)
    modal run ml/modal/train_app.py::quant_sweep  # compare int8 settings when the drop is too big
    modal run ml/modal/train_app.py::evaluate     # ONE-TIME score of the frozen model on the locked sets
    modal run ml/modal/train_app.py::review       # heatmaps of the worst errors, for human tagging

The training code is plain Python in ml/train/ (ADR-13). This file only moves it to a GPU.
Raw images are read from the triagelens-data volume, runs are written to triagelens-runs.
Nothing here reads the test split (ML-DATA-04).
"""

import json
import statistics
import subprocess
import sys
from pathlib import Path

import modal

APP_NAME = "triagelens-train"
DATA_DIR = "/data"
RUNS_DIR = "/runs"
RAW = f"{DATA_DIR}/shenzhen/raw"  # where ml/modal/README.md uploads the raw set
# One folder per preprocessing version, so arrays from an old spec are never mixed in.
PROCESSED = f"{DATA_DIR}/shenzhen/processed_v2_cxr-pre-2"  # dataset v2 (0445b087fed038c4)
MANIFEST = "/root/ml/manifests/shenzhen_v2/manifest.csv"
# Locked external test set (ml/pipeline/build_external.py), uploaded with
#   modal volume put triagelens-data ml/data/raw/montgomery /montgomery/raw
MONT_RAW = f"{DATA_DIR}/montgomery/raw"
MONT_PROCESSED = f"{DATA_DIR}/montgomery/processed_v1_cxr-pre-2"
MONT_MANIFEST = "/root/ml/manifests/montgomery_v1/manifest.csv"
GPU = "T4"  # same as app.py; enough for MobileNet-sized backbones
BACKBONES = ("mobilenetv3_large", "efficientnet_lite0")
SEEDS = (1, 2, 3)  # TRD 9.4: three seeds per configuration

# On the laptop this file is ml/modal/train_app.py, two levels under the repo root.
# In the Modal container it is /root/train_app.py and the repo is not there, so the
# repo path is only worked out locally (it is only used to build the image and log git).
REPO = Path(__file__).resolve().parents[2] if modal.is_local() else Path("/root")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements(str(REPO / "ml" / "requirements-train.txt"))
    .add_local_dir(str(REPO / "ml" / "train"), "/root/ml/train")
    .add_local_dir(str(REPO / "ml" / "export"), "/root/ml/export")
    .add_local_dir(str(REPO / "ml" / "manifests"), "/root/ml/manifests")
)
data_volume = modal.Volume.from_name("triagelens-data")
runs_volume = modal.Volume.from_name("triagelens-runs", create_if_missing=True)
app = modal.App(APP_NAME, image=image)


def _train_code():
    sys.path.insert(0, "/root/ml/train")


@app.function(cpu=8, memory=16384, timeout=30 * 60, volumes={DATA_DIR: data_volume})
def prepare_remote() -> dict:
    _train_code()
    import prepare_data

    report = prepare_data.prepare(RAW, MANIFEST, PROCESSED, workers=8)
    data_volume.commit()
    return report


@app.function(gpu=GPU, cpu=4, timeout=30 * 60, volumes={DATA_DIR: data_volume, RUNS_DIR: runs_volume})
def baselines_remote(stamp: str) -> dict:
    _train_code()
    import baselines

    report = baselines.run(PROCESSED, f"{RUNS_DIR}/baselines/{stamp}", backbones=BACKBONES)
    runs_volume.commit()
    return report


@app.function(timeout=10 * 60, volumes={RUNS_DIR: runs_volume})
def plot_bakeoff_remote(run_dirs: list, stamp: str) -> str:
    _train_code()
    from plot_curves import plot_bakeoff

    runs_volume.reload()
    out = plot_bakeoff(run_dirs, f"{RUNS_DIR}/bakeoff/bakeoff_curves_{stamp}.png")
    runs_volume.commit()
    return str(out)


@app.function(gpu=GPU, cpu=4, memory=16384, timeout=60 * 60,
              volumes={DATA_DIR: data_volume, RUNS_DIR: runs_volume})
def train_remote(backbone: str, seed: int, git_commit: str, git_dirty: bool) -> dict:
    _train_code()
    from train import Config, run

    run_dir, metrics = run(Config(backbone=backbone, seed=seed), PROCESSED, f"{RUNS_DIR}/bakeoff",
                           git_commit=git_commit, git_dirty=git_dirty)
    runs_volume.commit()
    return {"run_dir": str(run_dir), **metrics}


@app.function(cpu=4, memory=8192, timeout=30 * 60,
              volumes={DATA_DIR: data_volume, RUNS_DIR: runs_volume})
def export_remote(run_dir: str) -> dict:
    """Story E5-02: fp32 ONNX, int8 QDQ and int8 QOperator for one run, with the drop check."""
    _train_code()
    sys.path.insert(0, "/root/ml/export")
    import export_onnx

    runs_volume.reload()
    report = export_onnx.export_run(run_dir, PROCESSED)
    runs_volume.commit()
    return report


@app.function(cpu=4, memory=16384, timeout=60 * 60,
              volumes={DATA_DIR: data_volume, RUNS_DIR: runs_volume})
def sweep_remote(run_dir: str) -> dict:
    """Story E5-02: try each int8 setting on one run (ADR-17 follow-up)."""
    _train_code()
    sys.path.insert(0, "/root/ml/export")
    import export_onnx

    runs_volume.reload()
    out = export_onnx.sweep_run(run_dir, PROCESSED)
    runs_volume.commit()
    return out


@app.function(cpu=4, memory=16384, timeout=60 * 60,
              volumes={DATA_DIR: data_volume, RUNS_DIR: runs_volume})
def evaluate_remote(run_dir: str) -> dict:
    """Stories E2-02 and E11-01: score the frozen model once on the Shenzhen test split and
    Montgomery (ML-DATA-04). Refuses if this run was already scored."""
    _train_code()
    sys.path.insert(0, "/root/ml/export")
    import evaluate as ev
    import prepare_data

    if not Path(f"{MONT_PROCESSED}/external.npz").exists():
        prepare_data.prepare(MONT_RAW, MONT_MANIFEST, MONT_PROCESSED, workers=4,
                             img_subdir="images/images", splits=("external",))
        data_volume.commit()
    runs_volume.reload()
    report = ev.evaluate(run_dir, {"shenzhen_test": (PROCESSED, "test"), "montgomery": (MONT_PROCESSED, "external")},
                         f"{RUNS_DIR}/eval/{Path(run_dir).name}", PROCESSED)
    runs_volume.commit()
    return report


@app.function(cpu=4, memory=8192, timeout=30 * 60,
              volumes={DATA_DIR: data_volume, RUNS_DIR: runs_volume})
def review_remote(run_dir: str, per_kind: int) -> dict:
    """Prosit 2 C2: heatmaps of the worst errors on validation and Montgomery. Describes the
    errors only; uses the threshold the one-time evaluation took from validation."""
    _train_code()
    import error_review

    runs_volume.reload()
    name = Path(run_dir).name
    report = json.loads(Path(f"{RUNS_DIR}/eval/{name}/eval_report.json").read_text())
    rows, summary = error_review.review(run_dir, {"shenzhen_val": (PROCESSED, "val"), "montgomery": (MONT_PROCESSED, "external")},
                               report["operating_point"]["probability_threshold"], f"{RUNS_DIR}/review/{name}",
                               per_kind=per_kind)
    runs_volume.commit()
    return {"rows": rows, "summary": summary}


def _git_state():
    """Code commit for the run log (Team Rules 7). A dirty tree is recorded, not hidden."""
    def git(*args):
        return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()
    commit, dirty = git("rev-parse", "HEAD") or "unknown", bool(git("status", "--porcelain", "ml/"))
    if dirty:
        print("WARNING: uncommitted changes under ml/. Commit first, or this run cannot be reproduced.")
    return commit, dirty


@app.local_entrypoint()
def prepare():
    print(json.dumps(prepare_remote.remote(), indent=2))


@app.local_entrypoint()
def baselines():
    import datetime

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    print(json.dumps(baselines_remote.remote(stamp), indent=2))


@app.local_entrypoint()
def train_one(backbone: str = "mobilenetv3_large", seed: int = 1):
    commit, dirty = _git_state()
    print(json.dumps(train_remote.remote(backbone, seed, commit, dirty), indent=2))


@app.local_entrypoint()
def bakeoff(backbones: str = ""):
    """ADR-15: both backbones, three seeds each, run in parallel; prints the comparison.

    backbones: comma-separated subset, e.g. --backbones efficientnet_lite0 to retrain only the
    chosen backbone (ADR-18) on a new dataset version. Default: all of BACKBONES.
    """
    chosen = tuple(b for b in backbones.split(",") if b) or BACKBONES
    unknown = set(chosen) - set(BACKBONES)
    if unknown:
        raise SystemExit(f"unknown backbone(s) {sorted(unknown)}, expected {BACKBONES}")
    commit, dirty = _git_state()
    jobs = [(b, s, commit, dirty) for b in chosen for s in SEEDS]
    results = list(train_remote.starmap(jobs))
    print(f"\n{'backbone':20s} {'val AUROC per seed':28s} {'mean':>6s} {'sd':>6s} "
          f"{'fit gap':>8s} {'masked drop':>12s} {'shape corr':>11s}")
    summary = {}
    for b in chosen:
        rs = [r for r in results if r["backbone"] == b]
        aucs = [r["val"]["auroc"] for r in rs]
        drops = [r["shortcut_check"]["drop"] for r in rs]
        gaps = [r["fit"]["gap"] for r in rs]
        corrs = [(r["shape_check"]["within_class_corr"]["normal"]
                  + r["shape_check"]["within_class_corr"]["tb"]) / 2 for r in rs]
        summary[b] = {"val_auroc": aucs, "mean": statistics.mean(aucs), "sd": statistics.stdev(aucs),
                      "fit_gap_mean": statistics.mean(gaps),
                      "best_epoch_is_last": [r["fit"]["best_epoch_is_last"] for r in rs],
                      "masked_drop_mean": statistics.mean(drops),
                      "shape_corr_mean": statistics.mean(corrs), "runs": [r["run_dir"] for r in rs]}
        print(f"{b:20s} {', '.join(f'{a:.3f}' for a in aucs):28s} "
              f"{summary[b]['mean']:6.3f} {summary[b]['sd']:6.3f} {summary[b]['fit_gap_mean']:+8.3f} "
              f"{summary[b]['masked_drop_mean']:12.3f} {summary[b]['shape_corr_mean']:+11.3f}")
    import datetime

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    # git-ignored (ml/runs/); timestamped so an earlier bake-off is never overwritten
    out = REPO / "ml" / "runs" / f"bakeoff_summary_{stamp}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    jitter = sorted({r.get("shape_jitter") for r in results}, key=str)
    print(f"shape_jitter used: {jitter}")
    out.write_text(json.dumps({"git_commit": commit, "git_dirty": dirty, "shape_jitter": jitter,
                               "summary": summary}, indent=2))
    print(f"\nSummary saved to {out.relative_to(REPO)}")
    figure = plot_bakeoff_remote.remote([r["run_dir"] for r in results], stamp)
    print(f"Bake-off curves: {figure}. Each run folder also holds curves.png. Download all with:")
    print("    modal volume get --force triagelens-runs /bakeoff ml/runs/")


@app.local_entrypoint()
def export(summary: str = ""):
    """ADR-15 rule 2: export every run of a bake-off and compare the int8 AUROC drop.

    summary: a bake-off summary file in ml/runs/; the latest one when left empty.
    """
    runs_dir = REPO / "ml" / "runs"
    path = Path(summary) if summary else sorted(runs_dir.glob("bakeoff_summary_*.json"))[-1]
    bake = json.loads(path.read_text())
    print(f"Exporting the runs listed in {path.name} (shape_jitter {bake.get('shape_jitter')})")
    run_dirs = [r for b in bake["summary"].values() for r in b["runs"]]
    reports = list(export_remote.map(run_dirs))

    print(f"\n{'backbone':20s} {'seed':>4s} {'fp32':>6s} {'QDQ drop':>9s} {'QOp drop':>9s} "
          f"{'int8 MB':>8s} {'CAM r':>6s} {'QDQ ms':>7s} {'QOp ms':>7s} {'parity':>8s}")
    table = {}
    for r in reports:
        f = r["formats"]
        print(f"{r['backbone']:20s} {r['seed']:4d} {f['fp32']['auroc']:6.3f} "
              f"{f['int8_qdq']['auroc_drop']:+9.3f} {f['int8_qop']['auroc_drop']:+9.3f} "
              f"{f['int8_qdq']['size_mb']:8.2f} {f['int8_qdq']['cam_corr_with_fp32']:6.3f} "
              f"{f['int8_qdq']['cpu_latency_ms_1thread']:7.1f} {f['int8_qop']['cpu_latency_ms_1thread']:7.1f} "
              f"{r['parity_fp32_max_abs_logit']:8.1e}")
        table.setdefault(r["backbone"], []).append(r)
    for b, rs in table.items():
        ops = rs[0]["formats"]["int8_qop"]["ops"]
        print(f"  {b}: float ops left in int8 {ops['float_ops'] or 'none'}, "
              f"int8/float conversions {ops['quantize_dequantize_pairs']}")
    print("\nADR-15 rule 2 (drop at most 0.015) and rule 3 (at most 15 MB), per backbone:")
    out = {"bakeoff_summary": path.name, "backbones": {}}
    for b, rs in table.items():
        row = {}
        for fmt in ("int8_qdq", "int8_qop"):
            drops = [r["formats"][fmt]["auroc_drop"] for r in rs]
            sizes = [r["formats"][fmt]["size_mb"] for r in rs]
            row[fmt] = {"drops": drops, "mean_drop": statistics.mean(drops), "max_drop": max(drops),
                        "size_mb": max(sizes),
                        "rule2_pass_all_seeds": all(d <= 0.015 for d in drops),
                        "rule3_pass": max(sizes) <= 15.0}
            print(f"  {b:20s} {fmt:9s} mean drop {row[fmt]['mean_drop']:+.3f}  worst {row[fmt]['max_drop']:+.3f}  "
                  f"rule 2 {'pass' if row[fmt]['rule2_pass_all_seeds'] else 'FAIL'}  "
                  f"size {row[fmt]['size_mb']:.2f} MB rule 3 {'pass' if row[fmt]['rule3_pass'] else 'FAIL'}")
        out["backbones"][b] = row
    import datetime

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = runs_dir / f"export_summary_{stamp}.json"  # git-ignored
    dest.write_text(json.dumps(out, indent=2))
    print(f"\nSummary saved to {dest.relative_to(REPO)}. The ONNX files stay in each run's onnx/ folder:")
    print("    modal volume get --force triagelens-runs /bakeoff ml/runs/")


@app.local_entrypoint()
def quant_sweep(summary: str = ""):
    """Compare int8 settings on every run of a bake-off.

    Choosing rule, fixed before the results (export_onnx.sweep_run): per backbone, the
    setting with the lowest mean logit RMSE on held-out training images. The validation
    drop is printed beside it and is the ADR-15 rule 2 number; it does not choose.
    """
    runs_dir = REPO / "ml" / "runs"
    path = Path(summary) if summary else sorted(runs_dir.glob("bakeoff_summary_*.json"))[-1]
    bake = json.loads(path.read_text())
    run_dirs = [r for b in bake["summary"].values() for r in b["runs"]]
    print(f"Sweeping int8 settings for the runs in {path.name}")
    results = list(sweep_remote.map(run_dirs))

    by_backbone = {}
    for r in results:
        by_backbone.setdefault(r["backbone"], []).append(r)
    out = {"bakeoff_summary": path.name, "backbones": {}}
    for b, rs in by_backbone.items():
        print(f"\n{b} (fp32 val AUROC {statistics.mean(r['val_auroc_fp32'] for r in rs):.3f})")
        print(f"  {'setting':26s} {'holdout RMSE':>12s} {'max prob diff':>14s} {'val drop mean':>14s} {'worst':>7s}")
        rows = {}
        for name in rs[0]["configs"]:
            rmse = statistics.mean(r["configs"][name]["holdout"]["logit_rmse"] for r in rs)
            pdiff = max(r["configs"][name]["holdout"]["max_abs_prob_diff"] for r in rs)
            drops = [r["configs"][name]["val_drop"] for r in rs]
            rows[name] = {"holdout_logit_rmse": rmse, "holdout_max_prob_diff": pdiff, "val_drops": drops,
                          "val_drop_mean": statistics.mean(drops), "val_drop_worst": max(drops)}
            print(f"  {name:26s} {rmse:12.3f} {pdiff:14.3f} {statistics.mean(drops):+14.3f} {max(drops):+7.3f}")
        best = min(rows, key=lambda n: rows[n]["holdout_logit_rmse"])
        rule2 = rows[best]["val_drop_worst"] <= 0.015
        print(f"  chosen (lowest holdout RMSE): {best}; rule 2 on every seed: {'pass' if rule2 else 'FAIL'}")
        out["backbones"][b] = {"settings": rows, "chosen": best, "rule2_pass_all_seeds": rule2}
    import datetime

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = runs_dir / f"quant_sweep_{stamp}.json"  # git-ignored
    dest.write_text(json.dumps(out, indent=2))
    print(f"\nSummary saved to {dest.relative_to(REPO)}")


@app.local_entrypoint()
def evaluate(summary: str = "", backbone: str = "efficientnet_lite0"):
    """ONE-TIME evaluation of the frozen model (ADR-18: median seed by validation AUROC).

    The locked sets are scored once per frozen model; a second call for the same run stops.
    """
    runs_dir = REPO / "ml" / "runs"
    path = Path(summary) if summary else sorted(runs_dir.glob("bakeoff_summary_*.json"))[-1]
    entry = json.loads(path.read_text())["summary"][backbone]
    ranked = sorted(zip(entry["val_auroc"], entry["runs"]))
    val_auc, run_dir = ranked[len(ranked) // 2]
    print(f"Frozen model (median of {len(ranked)} seeds in {path.name}): {run_dir}, validation AUROC {val_auc:.3f}")
    print("Scoring the Shenzhen test split and Montgomery ONCE (ML-DATA-04).")
    r = evaluate_remote.remote(run_dir)

    op = r["operating_point"]
    print(f"\nThreshold from validation: probability {op['probability_threshold']:.3f} "
          f"(validation sensitivity {op['validation']['sensitivity']:.3f}, specificity {op['validation']['specificity']:.3f})")
    print(f"\n{'set':15s} {'n':>4s} {'TB':>4s} {'AUROC [95% CI]':>22s} {'sens':>6s} {'spec':>6s} "
          f"{'int8 drop':>9s} {'masked':>7s} {'shape corr':>11s}")
    for name, e in r["sets"].items():
        f, a = e["fp32"], e["at_validation_threshold"]
        corr = (e["shape_check"]["within_class_corr"]["normal"] + e["shape_check"]["within_class_corr"]["tb"]) / 2
        print(f"{name:15s} {f['n']:4d} {f['n_tb']:4d} {f['auroc']:7.3f} [{f['ci95'][0]:.3f}, {f['ci95'][1]:.3f}] "
              f"{a['sensitivity']:6.3f} {a['specificity']:6.3f} {e['int8']['drop']:+9.3f} "
              f"{e['border_masked_auroc']:7.3f} {corr:+11.3f}")
    dest = runs_dir / f"eval_{Path(run_dir).name}.json"  # git-ignored
    dest.write_text(json.dumps(r, indent=2))
    print(f"\nSaved to {dest.relative_to(REPO)}. Then, for subgroups (personal data stays on this machine):")
    print("    modal volume get --force triagelens-runs /eval ml/runs/")
    print(f"    python3 ml/train/subgroups.py ml/runs/eval/{Path(run_dir).name}")


@app.local_entrypoint()
def review(summary: str = "", backbone: str = "efficientnet_lite0", per_kind: int = 5):
    """Heatmaps of the worst errors of the frozen model, for two reviewers to tag (C2)."""
    runs_dir = REPO / "ml" / "runs"
    path = Path(summary) if summary else sorted(runs_dir.glob("bakeoff_summary_*.json"))[-1]
    entry = json.loads(path.read_text())["summary"][backbone]
    ranked = sorted(zip(entry["val_auroc"], entry["runs"]))
    run_dir = ranked[len(ranked) // 2][1]
    out = review_remote.remote(run_dir, per_kind)
    rows = out["rows"]
    print("\nAll images in each set at the evaluation threshold (no radiology needed):")
    print(f"{'set':13s} {'errors':>7s} {'border heat, errors':>20s} {'correct':>8s} "
          f"{'error rate landscape':>21s} {'portrait':>9s}")
    for name, s in out["summary"].items():
        fmt = lambda v: f"{v:.2f}" if v is not None else "-"  # noqa: E731
        print(f"{name:13s} {s['errors']:3d}/{s['n']:<3d} {fmt(s['border_heat_median_errors']):>20s} "
              f"{fmt(s['border_heat_median_correct']):>8s} {fmt(s.get('error_rate_landscape')):>21s} "
              f"{fmt(s.get('error_rate_portrait')):>9s}")
    print("\nWorst errors drawn as heatmaps:")
    print(f"\n{'set':13s} {'error':12s} {'prob':>6s} {'border heat':>12s} {'landscape':>10s}")
    for r in rows:
        print(f"{r['set']:13s} {r['error']:12s} {r['prob_tb']:6.3f} {r['border_heat_share']:12.0%} "
              f"{'yes' if r['landscape'] else '':>10s}")
    name = Path(run_dir).name
    print("\nImages stay private (git-ignored). Download, then tag review_sheet.csv (see HOW_TO_REVIEW.md):")
    print("    modal volume get --force triagelens-runs /review ml/runs/")
    print(f"    python3 ml/train/error_review.py agreement ml/runs/review/{name}/review_sheet.csv")
