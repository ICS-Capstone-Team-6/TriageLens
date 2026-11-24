"""Calibration and three-zone cut-offs from validation scores (story E6-01; TRD 7.2, 9.6;
ADR-8, ADR-20, ADR-25). No torch needed, so CI tests it; calibrate.py feeds it real logits.

- Temperature scaling (ML-CALIB-01): one number T, fitted on validation by minimising log
  loss; calibrated p = sigmoid(logit / T). Dividing by T keeps the order of the films, so AUROC
  and the zones do not change; only the probabilities do.
- Cut-offs (ML-CALIB-02): screen-out is set so at least 95% of validation TB films are not
  low risk; refer so at least 95% of validation normal films are below it. Each cut sits
  halfway between two neighbouring validation scores, so a tiny numeric difference between
  PyTorch and ONNX Runtime Web cannot move a validation film across it. The app's rule
  (triage.ts): probability >= refer -> refer now; probability < screen-out -> low risk.
- Zone cuts are stored on the raw sigmoid scale the app uses today (ADR-25), so any app
  version, including an old cached one, gives the same zones. T and the calibrated values
  are stored as information.
- ECE with equal-width bins and a bootstrap interval; reliability bins; a selective-prediction
  table (ML-CALIB-04); the Unsure share.
"""

import numpy as np


def sigmoid(z):
    return 1 / (1 + np.exp(-np.asarray(z, dtype=np.float64)))


def log_loss(y, p, eps=1e-12):
    y, p = np.asarray(y, dtype=np.float64), np.clip(np.asarray(p, dtype=np.float64), eps, 1 - eps)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def fit_temperature(y, logit, lo=0.05, hi=20.0):
    """T that minimises validation log loss: a coarse log-spaced grid, then a fine one around
    the best point. Deterministic; no optimiser state."""
    z = np.asarray(logit, dtype=np.float64)
    grid = np.exp(np.linspace(np.log(lo), np.log(hi), 2001))
    losses = [log_loss(y, sigmoid(z / t)) for t in grid]
    i = int(np.argmin(losses))
    fine = np.linspace(grid[max(i - 1, 0)], grid[min(i + 1, len(grid) - 1)], 2001)
    return float(fine[int(np.argmin([log_loss(y, sigmoid(z / t)) for t in fine]))])


def ece(y, p, bins=10):
    """Expected calibration error with equal-width bins (the last bin includes 1.0)."""
    y, p = np.asarray(y, dtype=np.float64), np.asarray(p, dtype=np.float64)
    idx = np.minimum((p * bins).astype(int), bins - 1)
    total = 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            total += abs(p[m].mean() - y[m].mean()) * m.sum() / len(y)
    return float(total)


def reliability(y, p, bins=10):
    """Per bin: [low edge, high edge, n, mean probability, share that is TB]. For the plot."""
    y, p = np.asarray(y, dtype=np.float64), np.asarray(p, dtype=np.float64)
    idx = np.minimum((p * bins).astype(int), bins - 1)
    rows = []
    for b in range(bins):
        m = idx == b
        rows.append([b / bins, (b + 1) / bins, int(m.sum()),
                     float(p[m].mean()) if m.any() else None, float(y[m].mean()) if m.any() else None])
    return rows


def ece_ci(y, p, bins=10, n=1000, seed=0):
    """95% bootstrap interval for ECE (ML-EVAL-02)."""
    rng = np.random.default_rng(seed)
    y, p = np.asarray(y), np.asarray(p)
    vals = [ece(y[i], p[i], bins) for i in (rng.integers(0, len(y), len(y)) for _ in range(n))]
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def zone_cuts(y, score, sens_target=0.95, spec_target=0.95):
    """(screen_out, refer) on the scale of `score`, each halfway between neighbouring scores.

    screen_out: the k-th highest TB score is the lowest TB that must stay out of low risk,
    k = ceil(sens_target * n_tb); the cut is halfway down to the next lower score of any film.
    refer: the m-th lowest normal score is the highest normal that must stay out of refer,
    m = ceil(spec_target * n_normal); the cut is halfway up to the next higher score of any film.
    Works for any increasing transform of the scores (raw or calibrated).
    """
    y, s = np.asarray(y), np.asarray(score, dtype=np.float64)
    pos = np.sort(s[y == 1])[::-1]
    neg = np.sort(s[y == 0])
    k = int(np.ceil(sens_target * len(pos) - 1e-9))
    m = int(np.ceil(spec_target * len(neg) - 1e-9))
    keep_tb, keep_norm = pos[k - 1], neg[m - 1]
    below = s[s < keep_tb]
    screen_out = (keep_tb + below.max()) / 2 if len(below) else keep_tb / 2
    above = s[s > keep_norm]
    refer = (keep_norm + above.min()) / 2 if len(above) else (keep_norm + 1) / 2
    if not screen_out < refer:
        raise ValueError("the screen-out cut is not below the refer cut on this validation set")
    return float(screen_out), float(refer)


def cut_margin(score, cut):
    """Distance from a cut to the nearest validation score: how far a score must drift to cross."""
    return float(np.min(np.abs(np.asarray(score, dtype=np.float64) - cut)))


def zones(score, screen_out, refer):
    """The app's rule (triage.ts): >= refer -> refer; < screen_out -> low; else unsure."""
    s = np.asarray(score, dtype=np.float64)
    return np.where(s >= refer, "refer", np.where(s < screen_out, "low_risk", "unsure"))


def wilson(k, n, z=1.96):
    if n == 0:
        return [float("nan"), float("nan")]
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [float(centre - half), float(centre + half)]


def zone_summary(y, score, screen_out, refer):
    """Counts per zone and label, the two operating points with Wilson intervals, Unsure share."""
    y = np.asarray(y)
    zz = zones(score, screen_out, refer)
    counts = {z: {"tb": int(((zz == z) & (y == 1)).sum()), "normal": int(((zz == z) & (y == 0)).sum())}
              for z in ("low_risk", "unsure", "refer")}
    n_tb, n_norm = int((y == 1).sum()), int((y == 0).sum())
    caught = n_tb - counts["low_risk"]["tb"]
    below_refer = n_norm - counts["refer"]["normal"]
    return {
        "counts": counts,
        "screen_out": {"tb_not_low_risk": caught, "n_tb": n_tb, "sensitivity": caught / n_tb,
                       "sensitivity_ci95": wilson(caught, n_tb),
                       "normal_in_low_risk": counts["low_risk"]["normal"],
                       "specificity": counts["low_risk"]["normal"] / n_norm,
                       "specificity_ci95": wilson(counts["low_risk"]["normal"], n_norm)},
        "refer": {"normal_below_refer": below_refer, "n_normal": n_norm, "specificity": below_refer / n_norm,
                  "specificity_ci95": wilson(below_refer, n_norm), "tb_in_refer": counts["refer"]["tb"],
                  "sensitivity": counts["refer"]["tb"] / n_tb, "sensitivity_ci95": wilson(counts["refer"]["tb"], n_tb)},
        "unsure_share": float((zz == "unsure").mean()),
    }


def selective_table(y, p, coverages=(1.0, 0.9, 0.8, 0.7, 0.6, 0.5)):
    """ML-CALIB-04: send the least certain films (closest to 0.5) for review first and report
    accuracy, at a 0.5 cut, on the films the tool still commits to."""
    y, p = np.asarray(y), np.asarray(p, dtype=np.float64)
    order = np.argsort(-np.abs(p - 0.5), kind="mergesort")  # most certain first
    rows = []
    for c in coverages:
        keep = order[: max(1, int(round(c * len(y))))]
        acc = float(((p[keep] >= 0.5).astype(int) == y[keep]).mean())
        rows.append({"coverage": c, "n_kept": int(len(keep)), "accuracy": acc})
    return rows
