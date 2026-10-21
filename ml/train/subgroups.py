"""Subgroup results for the one-time evaluation (TRD 9.9, ML-FAIR; story E11-01).

Runs on the team's machine, not on Modal: it joins the predictions written by
evaluate.py with the git-ignored private metadata (sex, age, inactive TB), so personal data
never leaves ml/data/. It prints and saves counts and rates only, never a row per patient.

The threshold is the one evaluate.py took from validation; nothing is tuned here.

Usage, after downloading the evaluation folder:
    modal volume get --force triagelens-runs /eval ml/runs/
    python3 ml/train/subgroups.py ml/runs/eval/<run>
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from metrics import auroc  # noqa: E402

PRIVATE = {
    "shenzhen_test": "ml/data/interim/shenzhen_v2/metadata_full.csv",
    "montgomery": "ml/data/interim/montgomery_v1/metadata_full.csv",
}
AGE_BANDS = ([14, 34, 54, 200], ["15-34", "35-54", "55+"])
MIN_GROUP = 10  # smaller groups are shown as counts only: rates on fewer would mislead


def wilson(k, n, z=1.96):
    if n == 0:
        return None
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [round(float(centre - half), 3), round(float(centre + half), 3)]


def group_stats(df, threshold_prob):
    y, p = df["label"].to_numpy(), df["prob_fp32"].to_numpy()
    n, n_tb = len(df), int(y.sum())
    out = {"n": n, "n_tb": n_tb}
    if n < MIN_GROUP:
        out["note"] = f"fewer than {MIN_GROUP}: counts only"
        return out
    hit = p >= threshold_prob
    tp, fn = int((hit & (y == 1)).sum()), int((~hit & (y == 1)).sum())
    tn, fp = int((~hit & (y == 0)).sum()), int((hit & (y == 0)).sum())
    if tp + fn:
        out.update(sensitivity=round(tp / (tp + fn), 3), sensitivity_ci95=wilson(tp, tp + fn))
    if tn + fp:
        out.update(specificity=round(tn / (tn + fp), 3), specificity_ci95=wilson(tn, tn + fp))
    if 0 < n_tb < n:
        out["auroc"] = round(auroc(y, p), 3)
    return out


def subgroups(eval_dir, private=PRIVATE):
    eval_dir = Path(eval_dir)
    report = json.loads((eval_dir / "eval_report.json").read_text())
    t = report["operating_point"]["probability_threshold"]
    result = {"run": report["run"], "probability_threshold": t, "sets": {}}
    for name in report["sets"]:
        preds = pd.read_csv(eval_dir / f"predictions_{name}.csv")
        meta = pd.read_csv(private[name])
        df = preds.merge(meta[[c for c in meta.columns if c in ("file", "sex", "age", "inactive_or_healed")]],
                         on="file", how="left")
        if df["sex"].isna().any():
            raise ValueError(f"{name}: {int(df['sex'].isna().sum())} predictions have no metadata row")
        df["age_band"] = pd.cut(df["age"], AGE_BANDS[0], labels=AGE_BANDS[1])
        groups = {"all": group_stats(df, t)}
        for col in ("sex", "age_band"):
            for value, g in df.groupby(col, observed=True):
                groups[f"{col}={value}"] = group_stats(g, t)
        if "inactive_or_healed" in df:
            normal = df[df["label"] == 0]
            tb = df[df["label"] == 1]
            active = pd.concat([normal, tb[~tb["inactive_or_healed"].astype(bool)]])
            inactive = pd.concat([normal, tb[tb["inactive_or_healed"].astype(bool)]])
            groups["tb=active (vs all normals)"] = group_stats(active, t)
            groups["tb=inactive or healed (vs all normals)"] = group_stats(inactive, t)
        result["sets"][name] = groups
    (eval_dir / "subgroups.json").write_text(json.dumps(result, indent=2))
    return result


def main(argv=None):
    ap = argparse.ArgumentParser(description="Subgroup results for an evaluation folder.")
    ap.add_argument("eval_dir")
    a = ap.parse_args(argv)
    r = subgroups(a.eval_dir)
    print(f"Threshold (probability, from validation): {r['probability_threshold']:.3f}")
    for name, groups in r["sets"].items():
        print(f"\n{name}")
        print(f"  {'group':38s} {'n':>4s} {'TB':>4s} {'sens':>6s} {'spec':>6s} {'AUROC':>6s}")
        for g, s in groups.items():
            fmt = lambda k: f"{s[k]:6.3f}" if k in s else f"{'-':>6s}"  # noqa: E731
            print(f"  {g:38s} {s['n']:4d} {s['n_tb']:4d} {fmt('sensitivity')} {fmt('specificity')} {fmt('auroc')}"
                  + (f"  ({s['note']})" if "note" in s else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
