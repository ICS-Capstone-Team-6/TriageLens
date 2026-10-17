#!/usr/bin/env python3
"""Score System Usability Scale (SUS) questionnaires.

Input CSV header: participant,q1,q2,...,q10 with answers 1 (strongly
disagree) to 5 (strongly agree). Standard scoring (Brooke 1996):
odd items contribute (answer - 1), even items contribute (5 - answer);
the sum is multiplied by 2.5 to give 0 to 100.

Usage: python3 sus.py responses.csv
"""
from __future__ import annotations

import csv
import statistics
import sys

ITEMS = [f"q{i}" for i in range(1, 11)]


def sus_score(answers: list[int]) -> float:
    if len(answers) != 10:
        raise ValueError(f"expected 10 answers, got {len(answers)}")
    total = 0
    for i, a in enumerate(answers, start=1):
        if not 1 <= a <= 5:
            raise ValueError(f"q{i} answer {a} is outside 1 to 5")
        total += (a - 1) if i % 2 == 1 else (5 - a)
    return total * 2.5


def score_file(path: str) -> dict[str, float]:
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in ["participant", *ITEMS] if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"missing columns: {', '.join(missing)}")
        return {row["participant"]: sus_score([int(row[q]) for q in ITEMS]) for row in reader}


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    scores = score_file(argv[0])
    if not scores:
        print("No responses found.")
        return 1
    for p, s in scores.items():
        print(f"{p}\t{s:.1f}")
    vals = list(scores.values())
    print(f"n={len(vals)}\tmean={statistics.mean(vals):.1f}\tmedian={statistics.median(vals):.1f}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
