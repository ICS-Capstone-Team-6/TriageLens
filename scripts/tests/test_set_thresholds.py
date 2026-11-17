"""Tests for apps/pwa/scripts/set_thresholds.py (ADR-20 rules), on synthetic scores."""
import importlib.util
import math
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("set_thresholds", ROOT / "apps" / "pwa" / "scripts" / "set_thresholds.py")
st = importlib.util.module_from_spec(spec)
spec.loader.exec_module(st)


class Thresholds(unittest.TestCase):
    def setUp(self):
        # 49 TB and 45 normal cases, like the Shenzhen v2 validation split, with overlap.
        self.labels = [1] * 49 + [0] * 45
        self.probs = [0.30 + 0.014 * i for i in range(49)] + [0.02 + 0.0115 * i for i in range(45)]

    def test_screen_out_meets_95_percent_sensitivity_and_is_the_highest(self):
        so, _ = st.thresholds(self.labels, self.probs)
        op = st.operating_point(self.labels, self.probs, so)
        self.assertGreaterEqual(op["sensitivity"], 0.95)
        self.assertLessEqual(op["fn"], 2)  # 47 of 49 must be flagged
        nudged = st.operating_point(self.labels, self.probs, so + 1e-9)
        self.assertLess(nudged["sensitivity"], 0.95)  # any higher threshold fails the rule

    def test_refer_meets_95_percent_specificity(self):
        _, ref = st.thresholds(self.labels, self.probs)
        op = st.operating_point(self.labels, self.probs, ref)
        self.assertGreaterEqual(op["specificity"], 0.95)
        self.assertGreaterEqual(op["tn"], math.ceil(0.95 * 45))

    def test_screen_out_not_above_refer_here(self):
        so, ref = st.thresholds(self.labels, self.probs)
        self.assertLessEqual(so, ref)

    def test_crossed_thresholds_are_detected(self):
        # Fully separated classes: the 95%-sensitivity point sits above the 95%-specificity
        # point, so the zones would overlap. main() refuses to write in this case (ADR-20).
        labels = [1] * 20 + [0] * 20
        probs = [0.6 + 0.01 * i for i in range(20)] + [0.1 + 0.01 * i for i in range(20)]
        so, ref = st.thresholds(labels, probs)
        self.assertGreater(so, ref)

    def test_needs_both_classes(self):
        with self.assertRaises(ValueError):
            st.thresholds([1, 1], [0.2, 0.3])

    def test_wilson_interval(self):
        lo, hi = st.wilson(47, 49)
        self.assertTrue(0.85 < lo < 0.96 < hi <= 1.0)


if __name__ == "__main__":
    unittest.main()
