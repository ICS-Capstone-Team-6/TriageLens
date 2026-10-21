"""Tests for the parts of ml/train that need only numpy, pandas and Pillow (story E2-01).

They run in the CI job with ml/requirements.txt. Synthetic images only.
"""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))
import metrics  # noqa: E402
import prepare_data  # noqa: E402
import preprocess  # noqa: E402


def make_raw(root, n=30, seed=0):
    """Synthetic raw folder plus a matching manifest, in the Shenzhen layout."""
    rng = np.random.default_rng(seed)
    (root / "CXR_png").mkdir(parents=True)
    rows = []
    for i in range(1, n + 1):
        label = i % 2
        name = f"CHNCXR_{i:04d}_{label}.png"
        w, h = int(rng.integers(560, 700)), int(rng.integers(560, 700))
        Image.fromarray(rng.integers(0, 255, (h, w), dtype=np.uint8)).save(root / "CXR_png" / name)
        data = (root / "CXR_png" / name).read_bytes()
        split = ("train", "train", "train", "val", "test")[i % 5]
        rows.append({"file": name, "patient_id": f"{i:04d}", "group_id": f"{i:04d}", "label": label,
                     "split": split, "width": w, "height": h, "bytes": len(data),
                     "sha256": hashlib.sha256(data).hexdigest(), "dhash": "0"})
    manifest = root / "manifest.csv"
    pd.DataFrame(rows).to_csv(manifest, index=False)
    return manifest


class TestPreprocess(unittest.TestCase):
    def test_check_preprocessing_refuses_other_versions(self):
        spec = {"version": "cxr-pre-2"}
        with tempfile.TemporaryDirectory() as d:
            good, old, missing = Path(d) / "good", Path(d) / "old", Path(d) / "missing"
            for folder, version in ((good, "cxr-pre-2"), (old, "cxr-pre-1")):
                folder.mkdir()
                (folder / "prepare_report.json").write_text(f'{{"preprocess_spec": "{version}"}}')
            self.assertEqual(preprocess.check_preprocessing({"preprocess_spec": "cxr-pre-2"}, [good], spec), "cxr-pre-2")
            for cfg, dirs in (({"preprocess_spec": "cxr-pre-1"}, [good]),  # old checkpoint
                              ({}, [good]),                                 # version not recorded
                              ({"preprocess_spec": "cxr-pre-2"}, [old]),    # old prepared data
                              ({"preprocess_spec": "cxr-pre-2"}, [missing])):
                with self.subTest(cfg=cfg, dirs=dirs), self.assertRaises(ValueError):
                    preprocess.check_preprocessing(cfg, dirs, spec)

    def test_spec_matches_model_interface(self):
        spec = preprocess.load_spec()
        self.assertEqual(spec["input_size"], 320)  # TRD 10.6
        self.assertEqual(spec["channels"], 3)

    def test_spec_is_stretch_version(self):
        spec = preprocess.load_spec()
        self.assertEqual(spec["version"], "cxr-pre-2")  # ADR-16
        self.assertNotIn("pad_value", spec)

    def test_wide_image_fills_square_with_no_bars(self):
        # cxr-pre-1 padded a wide image with black bars; bars encoded the aspect ratio,
        # which predicts TB in Shenzhen (ADR-16). cxr-pre-2 stretches, so no bars.
        out = preprocess.to_model_size(Image.new("L", (640, 320), 200))
        self.assertEqual(out.shape, (320, 320))
        self.assertEqual(out.dtype, np.uint8)
        self.assertTrue((out == 200).all())

    def test_image_shape_leaves_no_trace(self):
        # a narrow and a wide image of the same uniform content give identical inputs
        narrow = preprocess.to_model_size(Image.new("L", (2600, 3000), 120))
        wide = preprocess.to_model_size(Image.new("L", (3000, 2900), 120))
        self.assertTrue(np.array_equal(narrow, wide))

    def test_converts_colour_to_grayscale(self):
        out = preprocess.to_model_size(Image.new("RGB", (400, 400), (255, 0, 0)))
        self.assertEqual(out.shape, (320, 320))

    def test_normalize_shapes_and_values(self):
        spec = preprocess.load_spec()
        one = preprocess.normalize(np.full((320, 320), 255, np.uint8))
        self.assertEqual(one.shape, (3, 320, 320))
        expected = (1 - spec["mean"][0]) / spec["std"][0]
        self.assertAlmostEqual(float(one[0, 0, 0]), expected, places=5)
        batch = preprocess.normalize(np.zeros((4, 320, 320), np.uint8))
        self.assertEqual(batch.shape, (4, 3, 320, 320))
        self.assertEqual(batch.dtype, np.float32)

    def test_preprocess_file_is_one_batch(self):
        with tempfile.TemporaryDirectory() as d:
            Image.new("L", (900, 700), 128).save(Path(d) / "a.png")
            self.assertEqual(preprocess.preprocess_file(Path(d) / "a.png").shape, (1, 3, 320, 320))


class TestMetrics(unittest.TestCase):
    def test_auroc_known_values(self):
        self.assertEqual(metrics.auroc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]), 1.0)
        self.assertEqual(metrics.auroc([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1]), 0.0)
        self.assertEqual(metrics.auroc([0, 1], [0.5, 0.5]), 0.5)  # a tie counts half
        # 3 positive x 2 negative pairs, 5 of 6 ordered correctly
        self.assertAlmostEqual(metrics.auroc([0, 0, 1, 1, 1], [0.1, 0.6, 0.5, 0.7, 0.9]), 5 / 6)

    def test_auroc_one_class_is_nan(self):
        self.assertTrue(np.isnan(metrics.auroc([1, 1], [0.2, 0.9])))

    def test_spearman_known_values(self):
        self.assertAlmostEqual(metrics.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(metrics.spearman([1, 2, 3, 4], [9, 7, 5, 1]), -1.0)

    def test_shape_check_flags_a_shape_reader(self):
        # a "model" whose score is just narrowness: strong within-class correlation
        rng = np.random.default_rng(1)
        y = np.repeat([0, 1], 60)
        aspect = np.where(y == 1, 0.94, 1.0) + rng.normal(0, 0.05, 120)
        reader = metrics.shape_check(y, -aspect, aspect)
        self.assertLess(reader["within_class_corr"]["tb"], -0.9)
        self.assertLess(reader["within_class_corr"]["normal"], -0.9)
        # a score unrelated to shape: weak within-class correlation
        honest = metrics.shape_check(y, y + rng.normal(0, 0.5, 120), aspect)
        self.assertLess(abs(honest["within_class_corr"]["tb"]), 0.4)
        self.assertEqual(len(honest["by_aspect_third"]), 3)
        self.assertEqual(sum(b["n"] for b in honest["by_aspect_third"]), 120)

    def test_shape_check_handles_a_few_fixed_shapes(self):
        # Montgomery has only portrait and landscape films; thirds left a group empty and
        # crashed the first evaluation attempt (21 Oct 2026) before any result was shown
        rng = np.random.default_rng(3)
        aspect = np.r_[np.full(93, 0.8217), np.full(34, 1.2169)]
        y = rng.integers(0, 2, len(aspect))
        out = metrics.shape_check(y, y + rng.normal(0, 0.5, len(y)), aspect)
        self.assertEqual([g["n"] for g in out["by_aspect_value"]], [93, 34])
        one_class = metrics.shape_check(np.r_[np.zeros(5, int), np.ones(5, int)], np.arange(10.0),
                                        np.r_[np.full(5, 0.8), np.full(5, 1.2)])
        self.assertIsNone(one_class["by_aspect_value"][0]["auroc"])  # a group with no TB has no AUROC

    def test_bootstrap_ci_brackets_estimate(self):
        rng = np.random.default_rng(0)
        y = rng.integers(0, 2, 200)
        score = y + rng.normal(0, 1, 200)
        point = metrics.auroc(y, score)
        lo, hi = metrics.bootstrap_ci(y, score, n=300)
        self.assertLess(lo, point)
        self.assertGreater(hi, point)


class TestPrepare(unittest.TestCase):
    def test_writes_splits_and_hash(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_raw(root / "raw")
            report = prepare_data.prepare(root / "raw", manifest, root / "out", workers=1)
            m = pd.read_csv(manifest)
            for split in ("train", "val", "test"):
                with np.load(root / "out" / f"{split}.npz") as z:
                    self.assertEqual(z["x"].shape[1:], (320, 320))
                    self.assertEqual(len(z["y"]), int((m["split"] == split).sum()))
            self.assertEqual(report["dataset_version_hash"], prepare_data.dataset_version_hash(m))

    def test_changed_file_is_a_hard_fail(self):
        # provenance: a raw file edited after the manifest was built must stop the run
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_raw(root / "raw")
            Image.new("L", (600, 600), 7).save(root / "raw" / "CXR_png" / "CHNCXR_0003_1.png")
            with self.assertRaises(prepare_data.ProvenanceError):
                prepare_data.prepare(root / "raw", manifest, root / "out", workers=1)
            self.assertFalse((root / "out" / "train.npz").exists())

    def test_missing_file_is_a_hard_fail(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_raw(root / "raw")
            (root / "raw" / "CXR_png" / "CHNCXR_0004_0.png").unlink()
            with self.assertRaises(prepare_data.ProvenanceError):
                prepare_data.prepare(root / "raw", manifest, root / "out", workers=1)

    def test_version_hash_matches_pipeline_formula(self):
        # same formula as ml/pipeline/build_dataset.py, checked on both committed manifests
        for version, expected in (("shenzhen_v1", "702a4658c7447e13"), ("shenzhen_v2", "0445b087fed038c4")):
            manifest = Path(__file__).resolve().parents[1] / "manifests" / version / "manifest.csv"
            if not manifest.exists():
                self.skipTest("committed manifest not present")
            m = pd.read_csv(manifest, dtype={"patient_id": str, "group_id": str})
            self.assertEqual(prepare_data.dataset_version_hash(m), expected, version)


if __name__ == "__main__":
    unittest.main()
