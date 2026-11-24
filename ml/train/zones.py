"""Three-zone thresholds for the one-time evaluation (TRD 7.2, ADR-8; stories E6-01, E11-01).

Kept free of torch so CI can test it. evaluate.py imports it.
"""

import hashlib
import json
from pathlib import Path

import numpy as np


def _sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def wilson(k, n, z=1.96):
    """Wilson 95% interval for k of n (same as evaluate.py and subgroups.py)."""
    if n == 0:
        return [float("nan"), float("nan")]
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [float(centre - half), float(centre + half)]


class ThresholdsError(Exception):
    """The three-zone thresholds file is missing, interim, or for another model."""


INTERIM_VERSIONS = ("v0-uncalibrated",)  # ADR-20 slice thresholds: not the E6-01 result


def load_zone_thresholds(path, run_name, allow_interim=False):
    """Read the app's three-zone thresholds file (apps/pwa/public/config/thresholds.json).

    Returns logit cut-offs, so zones apply to calibrated scores when the file has a
    temperature (ADR-8): calibrated p = sigmoid(logit / T), and p >= q exactly when
    logit >= T * log(q / (1 - q)). The file must name this run, and an interim version is
    refused unless allow_interim, so the one-time score uses the E6-01 thresholds.
    Signature checks (ADR-11) belong to whoever signs the file; this records its SHA-256.
    """
    path = Path(path)
    if not path.exists():
        raise ThresholdsError(f"thresholds file not found: {path}")
    t = json.loads(path.read_text())
    if t.get("status") != "set":
        raise ThresholdsError(f"{path} status is {t.get('status')!r}, not 'set'")
    if t.get("run_id") != run_name:
        raise ThresholdsError(f"{path} is for run {t.get('run_id')!r}, not {run_name!r}")
    if t.get("version") in INTERIM_VERSIONS and not allow_interim:
        raise ThresholdsError(f"{path} is the interim version {t['version']!r}; wait for E6-01 (W2)")
    temp = float(t.get("temperature", 1.0))
    lo, hi = float(t["screen_out_probability"]), float(t["refer_probability"])
    if not (0 < lo < hi < 1) or temp <= 0:
        raise ThresholdsError(f"{path}: need 0 < screen_out < refer < 1 and temperature > 0")

    def to_logit(q):
        return temp * float(np.log(q / (1 - q)))

    return {"version": t.get("version"), "file_sha256": _sha256(path), "temperature": temp,
            "screen_out_probability": lo, "refer_probability": hi,
            "screen_out_logit": to_logit(lo), "refer_logit": to_logit(hi)}


def zone_report(y, logit, zones):
    """Three zones (TRD 7.2): low risk below screen-out, refer at or above refer, unsure
    between. Counts per zone and label, and the safety numbers: TB in low risk (missed),
    sensitivity of 'not low risk', specificity of 'not refer', and the unsure share."""
    y, z = np.asarray(y), np.asarray(logit)
    low, refer = z < zones["screen_out_logit"], z >= zones["refer_logit"]
    unsure = ~low & ~refer
    n_tb, n_norm = int((y == 1).sum()), int((y == 0).sum())
    count = {name: {"tb": int((m & (y == 1)).sum()), "normal": int((m & (y == 0)).sum())}
             for name, m in (("low_risk", low), ("unsure", unsure), ("refer", refer))}
    caught = n_tb - count["low_risk"]["tb"]
    not_referred = n_norm - count["refer"]["normal"]
    return {"counts": count,
            "tb_in_low_risk": count["low_risk"]["tb"],
            "sensitivity_not_low_risk": caught / max(n_tb, 1), "sensitivity_ci95": wilson(caught, n_tb),
            "specificity_not_refer": not_referred / max(n_norm, 1), "specificity_ci95": wilson(not_referred, n_norm),
            "refer_specificity_of_low_risk": count["low_risk"]["normal"] / max(n_norm, 1),
            "unsure_share": float(unsure.mean())}
