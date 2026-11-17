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


def build_fixture(root):
    """Prepared synthetic data, a one-epoch run and the two locked sets."""
    import prepare_data
    from test_train_core import make_raw
    from train import Config, run

    manifest = make_raw(root / "raw", n=40)
    prepare_data.prepare(root / "raw", manifest, root / "data", workers=1)
    ext_manifest = make_raw(root / "ext_raw" / "images", n=20, seed=1)
    m = pd.read_csv(ext_manifest)
    m["split"] = "external"
    m.to_csv(ext_manifest, index=False)
    prepare_data.prepare(root / "ext_raw" / "images", ext_manifest, root / "ext", workers=1, splits=("external",))
    run_dir, _ = run(Config(pretrained=False, epochs_head=1, epochs_max=1, batch_size=8, num_workers=0),
                     root / "data", root / "runs", log=lambda *_: None)
    sets = {"internal_test": (root / "data", "test"), "external": (root / "ext", "external")}
    return run_dir, sets


def locked_reads(load):
    """Locked splits a mocked load_split was asked for."""
    return [c.args[1] for c in load.call_args_list if c.args[1] in ("test", "external")]


@unittest.skipUnless(HAS_DEPS, "ml/requirements-train.txt not installed")
class TestOnceOnly(unittest.TestCase):
    """PR #84 review: a retry must never score a locked set a second time."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        cls.run_dir, cls.sets = build_fixture(cls.root)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_failure_between_sets_resumes_without_rescoring_the_first(self):
        from unittest import mock

        import evaluate as ev

        out = self.root / "eval_between"
        real_reserve = ev.reserve

        def crash_after_first_set(*a):
            if (out / "results" / "internal_test.json").exists():
                raise RuntimeError("crash between the two sets")
            return real_reserve(*a)

        with mock.patch.object(ev, "reserve", side_effect=crash_after_first_set), self.assertRaises(RuntimeError):
            ev.evaluate(self.run_dir, self.sets, out, self.root / "data", int8=False, log=lambda *_: None)
        self.assertTrue((out / "results" / "internal_test.json").exists())
        with mock.patch.object(ev, "load_split", side_effect=ev.load_split) as load:
            report = ev.evaluate(self.run_dir, self.sets, out, self.root / "data", int8=False, log=lambda *_: None)
        self.assertEqual(locked_reads(load), ["external"])  # the first set was not read again
        self.assertEqual(set(report["sets"]), {"internal_test", "external"})
        self.assertEqual([a["reused"] for a in report["attempts"]], [[], ["internal_test"]])

    def test_failure_while_scoring_a_set_refuses_any_retry(self):
        from unittest import mock

        import evaluate as ev

        out = self.root / "eval_during"
        real = ev.shape_check
        calls = []

        def crash_on_second(*a, **k):
            calls.append(1)
            if len(calls) == 2:
                raise RuntimeError("crash while scoring set two")
            return real(*a, **k)

        with mock.patch.object(ev, "shape_check", side_effect=crash_on_second), self.assertRaises(RuntimeError):
            ev.evaluate(self.run_dir, self.sets, out, self.root / "data", int8=False, log=lambda *_: None)
        with mock.patch.object(ev, "load_split", side_effect=ev.load_split) as load:
            with self.assertRaises(ev.AlreadyEvaluated):
                ev.evaluate(self.run_dir, self.sets, out, self.root / "data", int8=False, log=lambda *_: None)
        self.assertEqual(locked_reads(load), [])
        self.assertFalse((out / "eval_report.json").exists())

    def test_a_set_claimed_by_another_attempt_is_not_scored(self):
        from unittest import mock

        import evaluate as ev

        out = self.root / "eval_claimed"
        self.assertTrue(ev.reserve(out, "external", "someone-else"))  # e.g. a concurrent attempt
        with mock.patch.object(ev, "load_split", side_effect=ev.load_split) as load:
            with self.assertRaises(ev.AlreadyEvaluated):
                ev.evaluate(self.run_dir, self.sets, out, self.root / "data", int8=False, log=lambda *_: None)
        self.assertEqual(locked_reads(load), [])

    def test_other_preprocessing_is_refused_before_any_locked_read(self):
        from unittest import mock

        import evaluate as ev

        run_dir = self.root / "old_run"
        run_dir.mkdir()
        cfg = json.loads((self.run_dir / "config.json").read_text())
        cfg["preprocess_spec"] = "cxr-pre-1"
        (run_dir / "config.json").write_text(json.dumps(cfg))
        (run_dir / "best.pt").write_bytes((self.run_dir / "best.pt").read_bytes())
        out = self.root / "eval_old"
        with mock.patch.object(ev, "load_split") as load, self.assertRaises(ValueError):
            ev.evaluate(run_dir, self.sets, out, self.root / "data", int8=False, log=lambda *_: None)
        load.assert_not_called()
        self.assertFalse((out / "locked_sets").exists())


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
