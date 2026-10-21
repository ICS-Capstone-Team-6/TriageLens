"""Tests for the error review (ml/train/error_review.py). Synthetic data only."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import error_review as er  # noqa: E402

NEEDS = ("torch", "timm", "torchvision", "sklearn", "matplotlib")
HAS_DEPS = all(importlib.util.find_spec(m) for m in NEEDS)


class TestHelpers(unittest.TestCase):
    def test_border_share(self):
        cam = np.zeros((100, 100))
        cam[0:5, :] = 1.0  # all heat in the top band
        self.assertAlmostEqual(er.border_share(cam), 1.0)
        cam = np.zeros((100, 100))
        cam[40:60, 40:60] = 1.0  # all heat in the middle
        self.assertEqual(er.border_share(cam), 0.0)
        self.assertEqual(er.border_share(-np.ones((10, 10))), 0.0)  # no positive heat

    def test_worst_errors_picks_the_most_wrong_first(self):
        y = np.array([1, 1, 1, 0, 0, 0])
        p = np.array([0.05, 0.10, 0.90, 0.95, 0.30, 0.10])
        picks = er.worst_errors(y, p, threshold=0.2, per_kind=5)
        self.assertEqual(picks, [(0, "missed_tb"), (1, "missed_tb"), (3, "false_alarm"), (4, "false_alarm")])
        self.assertEqual(len(er.worst_errors(y, p, 0.2, per_kind=1)), 2)

    def test_cohen_kappa_matches_a_worked_example(self):
        # 10 items, 8 agreements. Rater A: 5 shortcut, 5 true_miss; rater B: 6 and 4.
        a = ["shortcut"] * 5 + ["true_miss"] * 5
        b = ["shortcut"] * 5 + ["true_miss"] * 3 + ["shortcut"] * 2
        k = er.cohen_kappa(a, b)
        # p_o = 0.8; p_e = 0.5*0.7 + 0.5*0.3 = 0.5; kappa = (0.8 - 0.5) / 0.5 = 0.6
        self.assertEqual((k["raw_agreement"], k["chance_agreement"], k["cohen_kappa"]), (0.8, 0.5, 0.6))

    def test_agreement_rejects_unknown_tags(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "sheet.csv"
            pd.DataFrame({"set": ["v"], "error": ["missed_tb"], "reviewer_1_tag": ["shortcut"],
                          "reviewer_2_tag": ["maybe"]}).to_csv(p, index=False)
            with self.assertRaises(ValueError):
                er.agreement(p)


@unittest.skipUnless(HAS_DEPS, "ml/requirements-train.txt not installed")
class TestReview(unittest.TestCase):
    def test_review_writes_images_sheet_and_instructions(self):
        import prepare_data
        from test_train_core import make_raw
        from train import Config, run

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_raw(root / "raw", n=40)
            prepare_data.prepare(root / "raw", manifest, root / "data", workers=1)
            run_dir, _ = run(Config(pretrained=False, epochs_head=1, epochs_max=1, batch_size=8, num_workers=0),
                             root / "data", root / "runs", log=lambda *_: None)
            rows = er.review(run_dir, {"val": (root / "data", "val")}, threshold=0.5, out_dir=root / "rev",
                             per_kind=2, log=lambda *_: None)
            sheet = pd.read_csv(root / "rev" / "review_sheet.csv")
            self.assertEqual(list(sheet.columns), er.SHEET_COLUMNS)
            self.assertEqual(len(sheet), len(rows))
            self.assertLessEqual(len(rows), 4)
            for r in rows:
                self.assertTrue((root / "rev" / r["image"]).exists())
                self.assertTrue(0.0 <= r["border_heat_share"] <= 1.0)
            self.assertTrue((root / "rev" / "HOW_TO_REVIEW.md").exists())
            if rows:
                self.assertTrue((root / "rev" / "contact_sheet_val.png").exists())


if __name__ == "__main__":
    unittest.main()
