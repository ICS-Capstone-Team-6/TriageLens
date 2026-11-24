"""One-time, local score of the frozen TB model on new locked external sets (story E11-01).

Used for the India sets DA and DB (ml/pipeline/build_india.py). They have no explicit
licence, so they stay on the team's machine and are scored here, not on Modal (team
decision, 24 Nov 2026; see ml/manifests/india_tb_v1/DATA_CARD.md).

The three-zone thresholds come from the app's thresholds file, written by E6-01 (W2) from
validation data only. This script refuses the interim ADR-20 file; --allow-interim works only with --check-only,
so the one-time score can only use the E6-01 thresholds. The thresholds file's
checkpoint_sha256, when present, must match the checkpoint being scored. Everything else follows evaluate.py: each set
is reserved before it is read, scored once, saved at once, and never scored again.

Run --check-only first: it checks the checkpoint, the thresholds file, the preprocessing
versions and the prepared folders, and touches no locked data.

Usage (from the repo root, with ml/requirements-train.txt installed):
    modal volume get triagelens-runs /bakeoff/efficientnet_lite0_seed1_20261021T114608Z ml/runs/frozen/
    python3 ml/train/evaluate_external.py --check-only
    python3 ml/train/evaluate_external.py
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

FROZEN_RUN = "ml/runs/frozen/efficientnet_lite0_seed1_20261021T114608Z"  # ADR-18
THRESHOLDS = "apps/pwa/public/config/thresholds.json"
VAL_DATA = "ml/data/processed/shenzhen_v2_cxr-pre-2"  # validation for the 90% point; train for int8
SETS = {"india_da": "ml/data/processed/india_da_v1_cxr-pre-2",
        "india_db": "ml/data/processed/india_db_v1_cxr-pre-2"}


def preflight(run_dir, thresholds, val_data, sets, out_dir, allow_interim=False):
    """Every check that needs no locked data. Returns (zones, summary); raises on a problem."""
    import evaluate as ev
    from preprocess import check_preprocessing

    run_dir, out_dir = Path(run_dir), Path(out_dir)
    for f in ("config.json", "best.pt"):
        if not (run_dir / f).exists():
            raise FileNotFoundError(f"{run_dir / f} missing: download the frozen run first (see module notes)")
    cfg = json.loads((run_dir / "config.json").read_text())
    checkpoint_sha = ev._sha256(run_dir / "best.pt")  # once; also bound to the thresholds file
    zones = ev.load_zone_thresholds(thresholds, run_dir.name, allow_interim=allow_interim,
                                    checkpoint_sha256=checkpoint_sha)
    check_preprocessing(cfg, [val_data, *sets.values()])
    summary = {"run": run_dir.name, "thresholds_version": zones["version"], "sets": {}}
    for name, d in sets.items():
        d = Path(d)
        if not (d / "external.npz").exists():
            raise FileNotFoundError(f"{d}/external.npz missing: run prepare_data.py --splits external")
        prep = json.loads((d / "prepare_report.json").read_text())
        status = ev.set_status(out_dir, name, checkpoint_sha)
        if status != "new":
            raise ev.AlreadyEvaluated(f"{name} is already {status} in {out_dir} (ML-DATA-04)")
        summary["sets"][name] = {"dataset_version_hash": prep["dataset_version_hash"],
                                 **prep["splits"]["external"]}
    return zones, summary


def main(argv=None):
    ap = argparse.ArgumentParser(description="One-time local score on new locked external sets.")
    ap.add_argument("--run-dir", default=FROZEN_RUN)
    ap.add_argument("--thresholds", default=THRESHOLDS)
    ap.add_argument("--val-data", default=VAL_DATA)
    ap.add_argument("--out", default=None, help="default: ml/runs/eval/<run>_india")
    ap.add_argument("--allow-interim", action="store_true",
                    help="with --check-only only: run the preflight against the interim ADR-20 file")
    ap.add_argument("--check-only", action="store_true", help="preflight only; reads no locked data")
    ap.add_argument("--no-int8", action="store_true")
    a = ap.parse_args(argv)
    out = Path(a.out or f"ml/runs/eval/{Path(a.run_dir).name}_india")
    if a.allow_interim and not a.check_only:
        # Scoring at the interim file would spend the one look at DA and DB (CLAUDE.md rule 4)
        # and block the E6-01 score for good. Interim is for preflight checks only.
        print("REFUSED: --allow-interim works only with --check-only; scoring waits for E6-01 thresholds",
              file=sys.stderr)
        return 2
    try:
        zones, summary = preflight(a.run_dir, a.thresholds, a.val_data, SETS, out, a.allow_interim)
    except Exception as e:  # a failed preflight is a clear message, not a traceback
        print(f"NOT READY: {e}", file=sys.stderr)
        return 1
    print(json.dumps({"ready": True, **summary, "zones": zones}, indent=2))
    if a.check_only:
        return 0

    import evaluate as ev

    report = ev.evaluate(a.run_dir, {name: (d, "external") for name, d in SETS.items()}, out, a.val_data,
                         int8=not a.no_int8, zones=zones)
    print(f"\n{'set':10s} {'n':>4s} {'TB':>4s} {'AUROC [95% CI]':>22s} {'TB in low':>9s} "
          f"{'sens':>6s} {'spec':>6s} {'unsure':>7s}")
    for name, e in report["sets"].items():
        f, z = e["fp32"], e["zones"]
        print(f"{name:10s} {f['n']:4d} {f['n_tb']:4d} {f['auroc']:7.3f} [{f['ci95'][0]:.3f}, {f['ci95'][1]:.3f}] "
              f"{z['tb_in_low_risk']:9d} {z['sensitivity_not_low_risk']:6.3f} {z['specificity_not_refer']:6.3f} "
              f"{z['unsure_share']:7.3f}")
    print(f"\nSaved to {out}/eval_report.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
