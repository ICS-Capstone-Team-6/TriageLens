"""Tests for the three-zone thresholds used in the one-time evaluation (E6-01, E11-01).
No torch needed. Synthetic scores only."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "ml" / "train"))
import zones  # noqa: E402

RUN = "efficientnet_lite0_seed1_20261021T114608Z"


def thresholds_file(d, **over):
    t = {"version": "v1-calibrated", "status": "set", "run_id": RUN,
         "screen_out_probability": 0.2, "refer_probability": 0.8, **over}
    path = Path(d) / "thresholds.json"
    path.write_text(json.dumps(t))
    return path


class TestLoad(unittest.TestCase):
    def test_logit_cutoffs_without_temperature(self):
        with tempfile.TemporaryDirectory() as d:
            z = zones.load_zone_thresholds(thresholds_file(d), RUN)
        self.assertAlmostEqual(z["screen_out_logit"], np.log(0.2 / 0.8))
        self.assertAlmostEqual(z["refer_logit"], np.log(0.8 / 0.2))
        self.assertEqual(z["temperature"], 1.0)
        self.assertEqual(len(z["file_sha256"]), 64)

    def test_temperature_scales_the_cutoffs(self):
        # calibrated p = sigmoid(logit / T) >= q  exactly when  logit >= T * logit(q)
        with tempfile.TemporaryDirectory() as d:
            z = zones.load_zone_thresholds(thresholds_file(d, temperature=2.0), RUN)
        for q, cut in ((0.2, z["screen_out_logit"]), (0.8, z["refer_logit"])):
            self.assertAlmostEqual(cut, 2.0 * np.log(q / (1 - q)))
            self.assertAlmostEqual(1 / (1 + np.exp(-cut / 2.0)), q)

    def test_refusals(self):
        with tempfile.TemporaryDirectory() as d:
            for over, msg in (({"run_id": "another_run"}, "not"),
                              ({"status": "pending"}, "status"),
                              ({"version": "v0-uncalibrated"}, "interim"),
                              ({"screen_out_probability": 0.9}, "screen_out < refer"),
                              ({"temperature": 0}, "temperature")):
                with self.subTest(over=over), self.assertRaisesRegex(zones.ThresholdsError, msg):
                    zones.load_zone_thresholds(thresholds_file(d, **over), RUN)
            with self.assertRaises(zones.ThresholdsError):
                zones.load_zone_thresholds(Path(d) / "missing.json", RUN)
            z = zones.load_zone_thresholds(thresholds_file(d, version="v0-uncalibrated"), RUN, allow_interim=True)
            self.assertEqual(z["version"], "v0-uncalibrated")

    def test_the_app_file_today_is_interim_and_refused(self):
        # Until E6-01 (W2) replaces it, the one-time score must not run on the ADR-20 file.
        app = REPO / "apps" / "pwa" / "public" / "config" / "thresholds.json"
        if json.loads(app.read_text()).get("version") not in zones.INTERIM_VERSIONS:
            self.skipTest("the app file is no longer interim")
        with self.assertRaisesRegex(zones.ThresholdsError, "interim"):
            zones.load_zone_thresholds(app, RUN)


class TestZoneReport(unittest.TestCase):
    def test_counts_and_safety_numbers(self):
        cut = {"screen_out_logit": -1.0, "refer_logit": 1.0}
        y = np.array([1, 1, 1, 1, 0, 0, 0, 0])
        z = np.array([-2.0, 0.0, 1.0, 3.0, -3.0, -1.0, 0.5, 2.0])
        r = zones.zone_report(y, z, cut)
        self.assertEqual(r["counts"], {"low_risk": {"tb": 1, "normal": 1},
                                       "unsure": {"tb": 1, "normal": 2},  # -1.0 sits on the cut: not low
                                       "refer": {"tb": 2, "normal": 1}})  # 1.0 sits on the cut: refer
        self.assertEqual(r["tb_in_low_risk"], 1)
        self.assertAlmostEqual(r["sensitivity_not_low_risk"], 3 / 4)
        self.assertAlmostEqual(r["specificity_not_refer"], 3 / 4)
        self.assertAlmostEqual(r["unsure_share"], 3 / 8)
        lo, hi = r["sensitivity_ci95"]
        self.assertTrue(lo < 0.75 < hi)

    def test_wilson_matches_known_value(self):
        lo, hi = zones.wilson(45, 49)
        self.assertAlmostEqual(lo, 0.808, places=3)
        self.assertAlmostEqual(hi, 0.968, places=3)


if __name__ == "__main__":
    unittest.main()
