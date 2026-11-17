"""Build public/config/reference.json for the slice's monitoring page.

Run by the ML lead on the machine that holds the (git-ignored) Shenzhen images.
It writes numbers only: histogram counts and bin edges, never pixels or IDs.

  python3 scripts/make_reference.py \
      --train-images train_paths.txt \
      --val-scores val_scores.csv \
      --run-id efficientnet_lite0_seed1_20261021T114608Z

  train_paths.txt   one training-split image path per line (from the dataset v2 manifest)
  val_scores.csv    the frozen run's validation predictions: a column named `probability`
                    (sigmoid of the fp32 tb_logit), one row per validation image

The input statistics use exactly the definitions in src/lib/stats.ts, on the cxr-pre-2
model input (Pillow 'L', bilinear resize to 320 x 320), so live and reference agree.
"""
import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 320
STATS = ["aspect_ratio", "edge_energy", "mean_brightness", "width"]


def stats_for(path):
    with Image.open(path) as im:
        w, h = im.size
        small = np.asarray(im.convert("L").resize((SIZE, SIZE), Image.BILINEAR), dtype=np.float64)
    c = small[1:-1, 1:-1]
    lap = np.abs(4 * c - small[1:-1, :-2] - small[1:-1, 2:] - small[:-2, 1:-1] - small[2:, 1:-1])
    return {
        "aspect_ratio": w / h,
        "edge_energy": float(lap.mean() / 255.0),
        "mean_brightness": float(small.mean()),
        "width": float(w),
    }


def decile_bins(values):
    """Ten bins with decile edges; the outer edges are pushed out so live values always land."""
    v = np.asarray(values, dtype=np.float64)
    edges = np.unique(np.quantile(v, np.linspace(0, 1, 11)))
    if len(edges) < 3:
        edges = np.array([v.min() - 1, v.min(), v.max() + 1])
    edges[0], edges[-1] = edges[0] - abs(edges[0]) * 0.5 - 1e-9, edges[-1] + abs(edges[-1]) * 0.5 + 1e-9
    counts = np.histogram(v, bins=edges)[0]
    return {"edges": [round(float(e), 6) for e in edges], "counts": [int(c) for c in counts]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train-images", required=True)
    ap.add_argument("--val-scores", required=True)
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "public" / "config" / "reference.json"))
    a = ap.parse_args()

    paths = [p.strip() for p in Path(a.train_images).read_text().splitlines() if p.strip()]
    rows = [stats_for(p) for p in paths]
    with open(a.val_scores, newline="") as f:
        probs = [float(r["probability"]) for r in csv.DictReader(f)]
    score_hist = np.histogram(np.clip(probs, 0, 1), bins=10, range=(0, 1))[0]

    ref = {
        "status": "set",
        "run_id": a.run_id,
        "note": f"Training input statistics from {len(rows)} images; validation scores from {len(probs)} images. Numbers only.",
        "score_hist_validation": [int(c) for c in score_hist],
        "inputs": {k: decile_bins([r[k] for r in rows]) for k in STATS},
    }
    Path(a.out).write_text(json.dumps(ref, indent=2) + "\n")
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
