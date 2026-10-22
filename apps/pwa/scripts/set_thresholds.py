"""Set the slice thresholds (ADR-20) and write public/config/thresholds.json.

Inputs, from the frozen run efficientnet_lite0_seed1_20261021T114608Z:
  --val     CSV of the Shenzhen v2 VALIDATION split only (94 images), columns `label`
            (1 = TB, 0 = normal) and `logit` (fp32 tb_logit). No image data.
  --model   the fp32 ONNX file the app will load (only its SHA-256 is read).

Rules (ADR-20, on validation only, raw logits):
  screen-out = highest threshold with sensitivity >= 0.95, where a case counts as flagged
               when probability >= threshold (the app gives Low risk only below it);
  refer      = lowest threshold with specificity >= 0.95, where a normal case counts as
               correctly not referred when probability < threshold. Any value between the
               last normal score that must stay below it and the next observed score gives
               the same validation result; the midpoint is used.

If the screen-out threshold comes out above the refer threshold the zones would overlap:
the script writes nothing and exits with an error (ADR-20: the team decides).

  python3 scripts/set_thresholds.py --val val_logits.csv --model model.fp32.onnx
"""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path

RUN_ID = "efficientnet_lite0_seed1_20261021T114608Z"
TARGET = 0.95
OUT = Path(__file__).resolve().parent.parent / "public" / "config" / "thresholds.json"


def sigmoid(z):
    return 1.0 / (1.0 + math.exp(-z))


def wilson(k, n, z=1.96):
    if n == 0:
        return [None, None]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(c - h, 3), round(c + h, 3)]


def operating_point(labels, probs, t):
    tp = sum(1 for y, p in zip(labels, probs) if y == 1 and p >= t)
    fn = sum(1 for y, p in zip(labels, probs) if y == 1 and p < t)
    tn = sum(1 for y, p in zip(labels, probs) if y == 0 and p < t)
    fp = sum(1 for y, p in zip(labels, probs) if y == 0 and p >= t)
    return {
        "threshold_probability": round(t, 6), "tp": tp, "fn": fn, "tn": tn, "fp": fp,
        "sensitivity": round(tp / (tp + fn), 3), "sensitivity_ci95": wilson(tp, tp + fn),
        "specificity": round(tn / (tn + fp), 3), "specificity_ci95": wilson(tn, tn + fp),
    }


def thresholds(labels, probs, target=TARGET):
    pos = sorted((p for y, p in zip(labels, probs) if y == 1), reverse=True)
    neg = sorted(p for y, p in zip(labels, probs) if y == 0)
    if not pos or not neg:
        raise ValueError("validation needs both TB and normal cases")
    k_pos = math.ceil(target * len(pos))  # positives that must score >= screen-out
    screen_out = pos[k_pos - 1]
    k_neg = math.ceil(target * len(neg))  # normals that must score < refer
    last_below = neg[k_neg - 1]
    above = [p for p in probs if p > last_below]
    refer = (last_below + min(above)) / 2 if above else min(1.0, last_below + 1e-6)
    return screen_out, refer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--val", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    with open(a.val, newline="") as f:
        rows = list(csv.DictReader(f))
    labels = [int(r["label"]) for r in rows]
    probs = [sigmoid(float(r["logit"])) for r in rows]
    screen_out, refer = thresholds(labels, probs)
    if screen_out > refer:
        raise SystemExit(f"screen-out {screen_out:.4f} is above refer {refer:.4f}: zones overlap. Nothing written; the team decides (ADR-20).")

    sha = hashlib.sha256(Path(a.model).read_bytes()).hexdigest()
    between = sum(1 for p in probs if screen_out <= p < refer)
    out = json.loads(Path(a.out).read_text()) if Path(a.out).exists() else {}
    out.update({
        "version": "v0-uncalibrated",
        "status": "set",
        "run_id": RUN_ID,
        "split": f"shenzhen_v2/validation ({len(labels)} images, {sum(labels)} TB)",
        "screen_out_probability": round(screen_out, 6),
        "refer_probability": round(refer, 6),
        "model_sha256": sha,
        "validation": {
            "screen_out": operating_point(labels, probs, screen_out),
            "refer": operating_point(labels, probs, refer),
            "not_sure_share": round(between / len(probs), 3),
        },
    })
    out.pop("note", None)
    Path(a.out).write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out["validation"], indent=2))
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
