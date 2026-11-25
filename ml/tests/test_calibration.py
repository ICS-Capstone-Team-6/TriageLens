"""Tests for calibration and three-zone cut-offs (story E6-01). No torch. Synthetic scores,
plus a check against the interim ADR-20 file's published validation numbers."""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))
import calibration as cal  # noqa: E402


def overconfident(n=4000, seed=0, t_true=2.5):
    """Labels drawn from sigmoid(z) but the model reports z * t_true: overconfident by t_true."""
    rng = np.random.default_rng(seed)
    z = rng.normal(0, 1.5, n)
    y = (rng.random(n) < cal.sigmoid(z)).astype(int)
    return y, z * t_true


class TestTemperature(unittest.TestCase):
    def test_recovers_a_known_temperature(self):
        y, logit = overconfident()
        t = cal.fit_temperature(y, logit)
        self.assertAlmostEqual(t, 2.5, delta=0.25)
        self.assertLess(cal.ece(y, cal.sigmoid(logit / t)), cal.ece(y, cal.sigmoid(logit)))
        self.assertLessEqual(cal.log_loss(y, cal.sigmoid(logit / t)), cal.log_loss(y, cal.sigmoid(logit)))

    def test_temperature_keeps_the_order(self):
        y, logit = overconfident(200, seed=3)
        a, b = cal.sigmoid(logit), cal.sigmoid(logit / 3.0)
        self.assertTrue(np.array_equal(np.argsort(a, kind="mergesort"), np.argsort(b, kind="mergesort")))


class TestEce(unittest.TestCase):
    def test_perfect_and_known_values(self):
        y = np.array([0, 0, 1, 1])
        self.assertAlmostEqual(cal.ece(y, np.array([0.0, 0.0, 1.0, 1.0])), 0.0)
        # one bin [0.6, 0.7): mean p 0.6, half are TB -> gap 0.1
        self.assertAlmostEqual(cal.ece(np.array([0, 1]), np.array([0.6, 0.6])), 0.1)
        rows = cal.reliability(y, np.array([0.05, 0.05, 0.95, 1.0]), bins=10)
        self.assertEqual(rows[9][2], 2)  # 1.0 lands in the last bin
        lo, hi = cal.ece_ci(*overconfident(300, seed=1), bins=10, n=200)
        self.assertLessEqual(lo, hi)


class TestCuts(unittest.TestCase):
    def test_cuts_sit_halfway_and_meet_the_rule(self):
        rng = np.random.default_rng(5)
        y = np.array([1] * 49 + [0] * 45)
        s = np.concatenate([rng.normal(2, 2, 49), rng.normal(-2, 1.5, 45)])
        lo, hi = cal.zone_cuts(y, s)
        summary = cal.zone_summary(y, s, lo, hi)
        self.assertGreaterEqual(summary["screen_out"]["sensitivity"], 0.95)
        self.assertGreaterEqual(summary["refer"]["specificity"], 0.95)
        self.assertFalse(np.any(s == lo) or np.any(s == hi))  # no film sits on a cut
        gap = np.min(np.abs(s - lo))
        self.assertGreater(gap, 0)

    def test_cuts_follow_any_increasing_transform(self):
        y, logit = overconfident(300, seed=2)
        raw = cal.zone_summary(y, cal.sigmoid(logit), *cal.zone_cuts(y, cal.sigmoid(logit)))["counts"]
        calib = cal.sigmoid(logit / 2.5)
        self.assertEqual(raw, cal.zone_summary(y, calib, *cal.zone_cuts(y, calib))["counts"])

    def test_ties_go_toward_refer_like_the_app(self):
        z = cal.zones(np.array([0.1, 0.2, 0.9]), screen_out=0.2, refer=0.9)
        self.assertEqual(list(z), ["low_risk", "unsure", "refer"])  # on a cut: never toward low risk

    def test_cut_margin(self):
        self.assertAlmostEqual(cal.cut_margin([0.1, 0.3, 0.9], 0.25), 0.05)

    def test_reproduces_the_interim_file_counts(self):
        # ADR-20 v0 on Shenzhen validation: 47 of 49 TB not low risk; 43 of 45 normal below refer.
        # Same rule here, on a stand-in with the same counts at each boundary (its Unsure count
        # differs from v0's 40, because the stand-in's other scores are made up).
        tb = np.concatenate([[0.05, 0.08], np.linspace(0.1, 0.99, 47)])
        normal = np.concatenate([np.linspace(0.01, 0.6, 43), [0.95, 0.97]])
        y = np.array([1] * 49 + [0] * 45)
        s = np.concatenate([tb, normal])
        summary = cal.zone_summary(y, s, *cal.zone_cuts(y, s))
        self.assertEqual(summary["screen_out"]["tb_not_low_risk"], 47)
        self.assertEqual(summary["refer"]["normal_below_refer"], 43)


class TestSelective(unittest.TestCase):
    def test_accuracy_rises_as_uncertain_films_are_deferred(self):
        y, logit = overconfident(1000, seed=4)
        rows = cal.selective_table(y, cal.sigmoid(logit / 2.5))
        self.assertEqual(rows[0]["coverage"], 1.0)
        self.assertGreaterEqual(rows[-1]["accuracy"], rows[0]["accuracy"])


if __name__ == "__main__":
    unittest.main()
