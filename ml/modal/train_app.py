"""Modal entry points for TB model training (story E2-01; ADR-13, ADR-14, ADR-15).

Run from the repo root, in this order:

    modal run ml/modal/train_app.py::prepare      # check hashes, build 320 px arrays (CPU)
    modal run ml/modal/train_app.py::baselines    # baseline ladder, rungs 0 to 2 (GPU)
    modal run ml/modal/train_app.py::bakeoff      # 2 backbones x 3 seeds (GPU, in parallel)
    modal run ml/modal/train_app.py::train_one --backbone mobilenetv3_large --seed 1

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
PROCESSED = f"{DATA_DIR}/shenzhen/processed_v1_cxr-pre-2"
MANIFEST = "/root/ml/manifests/shenzhen_v1/manifest.csv"
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
def bakeoff():
    """ADR-15: both backbones, three seeds each, run in parallel; prints the comparison."""
    commit, dirty = _git_state()
    jobs = [(b, s, commit, dirty) for b in BACKBONES for s in SEEDS]
    results = list(train_remote.starmap(jobs))
    print(f"\n{'backbone':20s} {'val AUROC per seed':28s} {'mean':>6s} {'sd':>6s} "
          f"{'fit gap':>8s} {'masked drop':>12s} {'shape corr':>11s}")
    summary = {}
    for b in BACKBONES:
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
    out = REPO / "ml" / "runs" / "bakeoff_summary.json"  # git-ignored (ml/runs/)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"git_commit": commit, "git_dirty": dirty, "summary": summary}, indent=2))
    print(f"\nSummary saved to {out.relative_to(REPO)}")
    import datetime

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    figure = plot_bakeoff_remote.remote([r["run_dir"] for r in results], stamp)
    print(f"Bake-off curves: {figure}. Each run folder also holds curves.png. Download all with:")
    print("    modal volume get triagelens-runs /bakeoff ml/runs/")
