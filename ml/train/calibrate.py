"""Calibrate the frozen TB model and write the app's three-zone thresholds file (story E6-01).

Reads only the validation split (TRD 9.6, ML-CALIB-01/02). Runs the frozen model in fp32 on
Shenzhen validation, fits the temperature, sets both cuts by the 95% rules, and writes:
- <out>/calibration_report.json and reliability.png (git-ignored run folder)
- the thresholds file the app reads (apps/pwa/public/config/thresholds.json), version v1

Zone cuts stay on the raw sigmoid scale that triage.ts uses, so every app version gives the
same zones; the temperature and calibrated cuts are stored beside them (ADR-27). The model hash
is carried over from the current file, which must name the same run.

Usage (from the repo root, with ml/requirements-train.txt installed):
    python3 ml/train/calibrate.py --check     # compute and print; write nothing
    python3 ml/train/calibrate.py             # write the report and thresholds v1
"""

import argparse
import datetime
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import calibration as cal  # noqa: E402

FROZEN_RUN = "ml/runs/frozen/efficientnet_lite0_seed1_20261021T114608Z"  # ADR-18
VAL_DATA = "ml/data/processed/shenzhen_v2_cxr-pre-2"
THRESHOLDS = "apps/pwa/public/config/thresholds.json"
VERSION = "v1-calibrated"
SENS, SPEC = 0.95, 0.95  # ADR-20 rules, kept for v1 (decision 24 Nov 2026)
ECE_TARGET = 0.05  # E6-01 acceptance criterion; TRD 3.4 floor is 0.10


def val_logits(run_dir, data_dir):
    """fp32 logits of the frozen model on the validation split, and the labels."""
    import torch

    from data import load_split
    from models import TBNet
    from preprocess import check_preprocessing, load_spec, normalize

    cfg = json.loads((Path(run_dir) / "config.json").read_text())
    check_preprocessing(cfg, [data_dir])
    model = TBNet(cfg["backbone"], pretrained=False)
    model.load_state_dict(torch.load(Path(run_dir) / "best.pt", map_location="cpu", weights_only=True))
    model.eval()
    val = load_split(data_dir, "val")
    spec = load_spec()
    out = []
    with torch.no_grad():
        for i in range(0, len(val["x"]), 32):
            out.append(model(torch.from_numpy(normalize(val["x"][i:i + 32], spec))).numpy())
    return val["y"].astype(int), np.concatenate(out).astype(np.float64), val["files"], cfg


def build(y, logit):
    """Everything W2 reports, from labels and raw logits."""
    t = cal.fit_temperature(y, logit)
    raw, calp = cal.sigmoid(logit), cal.sigmoid(logit / t)
    lo, hi = cal.zone_cuts(y, raw, SENS, SPEC)
    zl, zh = np.log(lo / (1 - lo)), np.log(hi / (1 - hi))  # the same cuts as logits
    lo_c, hi_c = float(cal.sigmoid(zl / t)), float(cal.sigmoid(zh / t))
    summary = cal.zone_summary(y, raw, lo, hi)
    if summary["counts"] != cal.zone_summary(y, calp, lo_c, hi_c)["counts"]:
        raise AssertionError("calibration changed the zones; it must not")
    return {
        "temperature": t,
        "log_loss": {"raw": cal.log_loss(y, raw), "calibrated": cal.log_loss(y, calp)},
        "ece": {f"{b}_bins": {"raw": cal.ece(y, raw, b), "raw_ci95": cal.ece_ci(y, raw, b),
                              "calibrated": cal.ece(y, calp, b), "calibrated_ci95": cal.ece_ci(y, calp, b)}
                for b in (10, 5)},
        "reliability_10_bins": {"raw": cal.reliability(y, raw), "calibrated": cal.reliability(y, calp)},
        "cuts": {"screen_out_probability": lo, "refer_probability": hi,
                 "screen_out_logit": float(zl), "refer_logit": float(zh),
                 "calibrated_screen_out_probability": lo_c, "calibrated_refer_probability": hi_c},
        "zones": summary,
        "selective_prediction": cal.selective_table(y, calp),
    }


def thresholds_file(result, current, run_name, checkpoint_sha, n, n_tb):
    """The v1 file: same fields the app reads (config.ts), plus calibration information."""
    if current.get("run_id") != run_name:
        raise ValueError(f"current thresholds file is for {current.get('run_id')!r}, not {run_name!r}")
    c, z = result["cuts"], result["zones"]
    return {
        "version": VERSION,
        "status": "set",
        "run_id": run_name,
        "split": f"shenzhen_v2/validation ({n} images, {n_tb} TB)",
        "rule": {
            "screen_out": f"halfway below the lowest score that keeps sensitivity >= {SENS} on validation (E6-01, ADR-20 rule)",
            "refer": f"halfway above the highest score that keeps specificity >= {SPEC} on validation (E6-01, ADR-20 rule)",
        },
        "probability_space": "raw_sigmoid",
        "screen_out_probability": round(c["screen_out_probability"], 6),
        "refer_probability": round(c["refer_probability"], 6),
        "model_sha256": current.get("model_sha256"),
        "checkpoint_sha256": checkpoint_sha,
        "calibration": {
            "method": "temperature scaling on validation logits (ADR-8)",
            "temperature": round(result["temperature"], 4),
            "calibrated_screen_out_probability": round(c["calibrated_screen_out_probability"], 6),
            "calibrated_refer_probability": round(c["calibrated_refer_probability"], 6),
            "ece_10_bins": {"before": round(result["ece"]["10_bins"]["raw"], 4),
                            "after": round(result["ece"]["10_bins"]["calibrated"], 4),
                            "after_ci95": [round(v, 4) for v in result["ece"]["10_bins"]["calibrated_ci95"]]},
            "ece_target": ECE_TARGET,
            "ece_target_met": result["ece"]["10_bins"]["calibrated"] <= ECE_TARGET,
            "for_display": False,
            "note": ("Zones use the raw cuts above; the calibrated values are the same cuts on the calibrated scale. "
                     "Not for display to health workers until the ECE target is met on more validation data (ADR-27)."),
        },
        "validation": {
            "screen_out": z["screen_out"], "refer": z["refer"], "counts": z["counts"],
            "not_sure_share": round(z["unsure_share"], 3),
        },
        "signature": None,
        "signature_note": "Signing (ADR-11) is deferred to E2-05 (ADR-27); the file is bound to the model by model_sha256.",
        "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    }


def plot(result, path):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return None
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot([0, 1], [0, 1], color="0.6", lw=1, label="perfectly calibrated")
    for key, style in (("raw", "o--"), ("calibrated", "s-")):
        rows = [r for r in result["reliability_10_bins"][key] if r[2]]
        ax.plot([r[3] for r in rows], [r[4] for r in rows], style, label=f"{key} (ECE {result['ece']['10_bins'][key]:.3f})")
    ax.set_xlabel("mean predicted probability (bin)")
    ax.set_ylabel("share of TB films (bin)")
    ax.set_title(f"Reliability, Shenzhen validation (T = {result['temperature']:.2f})")
    ax.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(description="Calibrate the frozen TB model; write thresholds v1.")
    ap.add_argument("--run-dir", default=FROZEN_RUN)
    ap.add_argument("--data", default=VAL_DATA)
    ap.add_argument("--thresholds", default=THRESHOLDS)
    ap.add_argument("--out", default=None, help="default: ml/runs/calibration/<run>")
    ap.add_argument("--check", action="store_true", help="compute and print only; write nothing")
    a = ap.parse_args(argv)
    run_dir = Path(a.run_dir)
    y, logit, files, cfg = val_logits(run_dir, a.data)
    result = build(y, logit)
    checkpoint_sha = hashlib.sha256((run_dir / "best.pt").read_bytes()).hexdigest()
    current = json.loads(Path(a.thresholds).read_text())
    tfile = thresholds_file(result, current, run_dir.name, checkpoint_sha, len(y), int(y.sum()))
    # The app reads the rounded values: they must give the same zones as the unrounded cuts.
    raw = cal.sigmoid(logit)
    lo, hi = tfile["screen_out_probability"], tfile["refer_probability"]
    if cal.zone_summary(y, raw, lo, hi)["counts"] != result["zones"]["counts"]:
        raise AssertionError("rounding the cuts changed the validation zones")
    tfile["validation"]["margin_to_nearest_score"] = {"screen_out": round(cal.cut_margin(raw, lo), 6),
                                                      "refer": round(cal.cut_margin(raw, hi), 6)}
    print(json.dumps({"temperature": result["temperature"], "ece": result["ece"], "cuts": result["cuts"],
                      "zones": result["zones"]["counts"], "unsure_share": result["zones"]["unsure_share"],
                      "selective_prediction": result["selective_prediction"]}, indent=2))
    if a.check:
        return 0
    out = Path(a.out or f"ml/runs/calibration/{run_dir.name}")
    out.mkdir(parents=True, exist_ok=True)
    report = {"run": run_dir.name, "checkpoint_sha256": checkpoint_sha, "dataset_version_hash": cfg.get("dataset_version_hash"),
              "split": "val", "n": int(len(y)), "n_tb": int(y.sum()), **result}
    (out / "calibration_report.json").write_text(json.dumps(report, indent=2))
    plot(result, out / "reliability.png")
    Path(a.thresholds).write_text(json.dumps(tfile, indent=2) + "\n")
    print(f"\nWrote {a.thresholds} ({VERSION}) and {out}/calibration_report.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
