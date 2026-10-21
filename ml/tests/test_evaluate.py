"""Tests for the one-time evaluation (ml/train/evaluate.py). Synthetic images and random
weights only. Skipped when the training requirements are not installed."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

NEEDS = ("torch", "timm", "torchvision", "sklearn", "matplotlib", "onnx", "onnxruntime")
HAS_DEPS = all(importlib.util.find_spec(m) for m in NEEDS)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))
sys.path.insert(0, str(Path(__file__).resolve().parent))


class TestHelpers(unittest.TestCase):
    @unittest.skipUnless(HAS_DEPS, "ml/requirements-train.txt not installed")
    def test_median_run_is_the_middle_seed_not_the_best(self):
        import evaluate as ev

        summary = {"summary": {"b": {"runs": ["r1", "r2", "r3"], "val_auroc": [0.922, 0.917, 0.927]}}}
        self.assertEqual(ev.median_run(summary, "b"), ("r1", 0.922))

    @unittest.skipUnless(HAS_DEPS, "ml/requirements-train.txt not installed")
    def test_threshold_reaches_target_sensitivity_on_validation(self):
        import evaluate as ev

        rng = np.random.default_rng(0)
        y = np.r_[np.ones(50, int), np.zeros(50, int)]
        s = np.r_[rng.normal(1, 1, 50), rng.normal(-1, 1, 50)]
        t = ev.threshold_for_sensitivity(y, s)
        op = ev.at_threshold(y, s, t)
        self.assertGreaterEqual(op["sensitivity"], 0.90)
        # the highest such threshold: one step higher would miss the target
        pos = s[y == 1]
        higher = pos[pos > t]
        if len(higher):
            self.assertLess(ev.at_threshold(y, s, higher.min())["sensitivity"], 0.90)

    @unittest.skipUnless(HAS_DEPS, "ml/requirements-train.txt not installed")
    def test_wilson_interval_contains_the_estimate(self):
        import evaluate as ev

        lo, hi = ev.wilson(45, 50)
        self.assertTrue(lo < 0.9 < hi)
        self.assertGreaterEqual(lo, 0.0)
        self.assertLessEqual(hi, 1.0)


@unittest.skipUnless(HAS_DEPS, "ml/requirements-train.txt not installed")
class TestEvaluate(unittest.TestCase):
    def test_external_split_is_locked_like_test(self):
        from data import LockedSplitError, load_split

        with self.assertRaises(LockedSplitError):
            load_split("anywhere", "external")

    def test_scores_both_sets_once_and_refuses_a_second_run(self):
        import evaluate as ev
        import prepare_data
        from test_train_core import make_raw
        from train import Config, run

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_raw(root / "raw", n=40)
            prepare_data.prepare(root / "raw", manifest, root / "data", workers=1)
            # an "external" set in another folder layout, one split only
            ext_manifest = make_raw(root / "ext_raw" / "images", n=20, seed=1)
            m = pd.read_csv(ext_manifest)
            m["split"] = "external"
            m.to_csv(ext_manifest, index=False)
            prepare_data.prepare(root / "ext_raw" / "images", ext_manifest, root / "ext", workers=1,
                                 splits=("external",))
            run_dir, _ = run(Config(pretrained=False, epochs_head=1, epochs_max=1, batch_size=8, num_workers=0),
                             root / "data", root / "runs", log=lambda *_: None)
            sets = {"internal_test": (root / "data", "test"), "external": (root / "ext", "external")}
            report = ev.evaluate(run_dir, sets, root / "eval", root / "data", log=lambda *_: None)

            self.assertEqual(set(report["sets"]), {"internal_test", "external"})
            for name, entry in report["sets"].items():
                for key in ("fp32", "int8", "at_validation_threshold", "border_masked_auroc", "shape_check"):
                    self.assertIn(key, entry, name)
                preds = pd.read_csv(root / "eval" / f"predictions_{name}.csv")
                self.assertEqual(len(preds), entry["fp32"]["n"])
                self.assertFalse({"sex", "age", "finding"} & set(preds.columns))  # no personal data
            self.assertGreaterEqual(report["operating_point"]["validation"]["sensitivity"], 0.90)
            self.assertEqual(json.loads((root / "eval" / "eval_report.json").read_text())["run"], run_dir.name)
            self.assertEqual([a["finished"] for a in report["attempts"]], [True])
            with self.assertRaises(ev.AlreadyEvaluated):
                ev.evaluate(run_dir, sets, root / "eval", root / "data", log=lambda *_: None)


class TestSubgroups(unittest.TestCase):
    def test_joins_private_metadata_and_reports_counts_and_rates_only(self):
        import subgroups as sg

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            rng = np.random.default_rng(0)
            files = [f"MCUCXR_{i:04d}_{i % 2}.png" for i in range(60)]
            labels = np.array([i % 2 for i in range(60)])
            pd.DataFrame({"file": files, "label": labels, "prob_fp32": np.clip(labels * 0.6 + rng.random(60) * 0.4, 0, 1),
                          "aspect": 1.0}).to_csv(root / "predictions_montgomery.csv", index=False)
            (root / "eval_report.json").write_text(json.dumps(
                {"run": "r", "operating_point": {"probability_threshold": 0.5}, "sets": {"montgomery": {}}}))
            meta = root / "meta.csv"
            pd.DataFrame({"file": files, "sex": ["female", "male"] * 30, "age": [20 + i for i in range(60)],
                          "finding": "x", "inactive_or_healed": [i % 4 == 1 for i in range(60)]}).to_csv(meta, index=False)
            r = sg.subgroups(root, private={"montgomery": meta})
            groups = r["sets"]["montgomery"]
            self.assertIn("sex=female", groups)
            self.assertIn("tb=inactive or healed (vs all normals)", groups)
            self.assertEqual(groups["all"]["n"], 60)
            saved = (root / "subgroups.json").read_text()
            self.assertNotIn("MCUCXR_", saved)  # aggregates only, no per-patient rows


if __name__ == "__main__":
    unittest.main()
