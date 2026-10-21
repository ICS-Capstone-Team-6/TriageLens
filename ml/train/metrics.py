"""Evaluation metrics (TRD 9.8, ML-EVAL-01 and 02). numpy only, so CI can test them."""

import numpy as np


def auroc(y, score):
    """Area under the ROC curve via the Mann-Whitney U statistic, ties counted as half."""
    y = np.asarray(y).astype(bool)
    score = np.asarray(score, dtype=np.float64)
    n_pos, n_neg = int(y.sum()), int((~y).sum())
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    order = np.argsort(score, kind="mergesort")
    ranks = np.empty(len(score), dtype=np.float64)
    sorted_scores = score[order]
    i = 0
    while i < len(score):  # average ranks over ties
        j = i
        while j + 1 < len(score) and sorted_scores[j + 1] == sorted_scores[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return float((ranks[y].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def bootstrap_ci(y, score, metric=auroc, n=1000, seed=0, level=0.95):
    """Percentile bootstrap interval, resampling cases with replacement (ML-EVAL-02)."""
    y, score = np.asarray(y), np.asarray(score)
    rng = np.random.default_rng(seed)
    stats = []
    for _ in range(n):
        idx = rng.integers(0, len(y), len(y))
        if y[idx].min() == y[idx].max():
            continue  # a resample with one class has no AUROC
        stats.append(metric(y[idx], score[idx]))
    lo, hi = np.percentile(stats, [(1 - level) / 2 * 100, (1 + level) / 2 * 100])
    return float(lo), float(hi)


def summarize(y, score, seed=0):
    """AUROC with its 95% bootstrap interval and the case counts behind it."""
    lo, hi = bootstrap_ci(y, score, seed=seed)
    return {"auroc": auroc(y, score), "ci95": [lo, hi], "n": int(len(y)), "n_tb": int(np.sum(y))}


def _ranks(x):
    x = np.asarray(x, dtype=np.float64)
    order = np.argsort(x, kind="mergesort")
    ranks = np.empty(len(x))
    ranks[order] = np.arange(len(x))
    for v in np.unique(x):  # average ranks over ties
        idx = x == v
        ranks[idx] = ranks[idx].mean()
    return ranks


def spearman(a, b):
    """Spearman rank correlation, -1 to 1."""
    ra, rb = _ranks(a), _ranks(b)
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def shape_check(y, score, aspect):
    """Does the score follow image shape rather than the lungs? (ADR-16)

    In the Shenzhen set TB images are narrower, so aspect ratio alone predicts TB.
    within_class_corr: rank correlation of score with aspect inside each class. Near 0
      means shape does not drive the score; strongly negative means narrower images
      get higher TB scores whatever their label.
    by_aspect_third: AUROC within each third of the aspect-ratio range. If the model
      read shape, AUROC would drop inside groups of similar shape.
    """
    y, score, aspect = np.asarray(y), np.asarray(score), np.asarray(aspect)
    levels = np.unique(aspect)
    if len(levels) <= 3:
        # A few fixed shapes (Montgomery: portrait and landscape only): one group per shape.
        # Thirds by quantile would leave a group empty.
        key, group = "by_aspect_value", np.searchsorted(levels, aspect)
        n_groups = len(levels)
    else:
        key, group = "by_aspect_third", np.digitize(aspect, np.quantile(aspect, [1 / 3, 2 / 3]))
        n_groups = 3
    groups = []
    for g in range(n_groups):
        sel = group == g
        if not sel.any():
            continue
        both = 0 < y[sel].sum() < sel.sum()
        groups.append({"aspect_range": [float(aspect[sel].min()), float(aspect[sel].max())],
                       "n": int(sel.sum()), "n_tb": int(y[sel].sum()),
                       "auroc": auroc(y[sel], score[sel]) if both else None})
    return {
        "aspect_alone_auroc": auroc(y, -aspect),  # narrower = TB, as in the data
        "within_class_corr": {"normal": spearman(score[y == 0], aspect[y == 0]),
                              "tb": spearman(score[y == 1], aspect[y == 1])},
        key: groups,
    }
