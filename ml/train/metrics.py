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
