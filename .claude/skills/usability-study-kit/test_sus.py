#!/usr/bin/env python3
"""Tests for sus.py. Run: python3 .claude/skills/usability-study-kit/test_sus.py"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sus import score_file, sus_score  # noqa: E402


class SusScoreTest(unittest.TestCase):
    def test_best_possible(self):
        self.assertEqual(sus_score([5, 1] * 5), 100.0)

    def test_worst_possible(self):
        self.assertEqual(sus_score([1, 5] * 5), 0.0)

    def test_all_neutral(self):
        self.assertEqual(sus_score([3] * 10), 50.0)

    def test_known_example(self):
        # odd: 4,4,5,4,4 -> 3+3+4+3+3=16; even: 2,1,2,1,2 -> 3+4+3+4+3=17; (16+17)*2.5
        self.assertEqual(sus_score([4, 2, 4, 1, 5, 2, 4, 1, 4, 2]), 82.5)

    def test_rejects_wrong_length(self):
        with self.assertRaises(ValueError):
            sus_score([3] * 9)

    def test_rejects_out_of_range(self):
        with self.assertRaises(ValueError):
            sus_score([3] * 9 + [6])

    def test_score_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write("participant," + ",".join(f"q{i}" for i in range(1, 11)) + "\n")
            f.write("P1," + ",".join(["5", "1"] * 5) + "\n")
            f.write("P2," + ",".join(["3"] * 10) + "\n")
        try:
            self.assertEqual(score_file(f.name), {"P1": 100.0, "P2": 50.0})
        finally:
            os.unlink(f.name)


if __name__ == "__main__":
    unittest.main()
