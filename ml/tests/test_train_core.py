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
    def test_spec_matches_model_interface(self):
        spec = preprocess.load_spec()
        self.assertEqual(spec["input_size"], 320)  # TRD 10.6
        self.assertEqual(spec["channels"], 3)

    def test_letterbox_keeps_aspect_and_pads(self):
        img = Image.new("L", (640, 320), 200)  # wide image: padding above and below
        out = preprocess.letterbox(img)
        self.assertEqual(out.shape, (320, 320))
        self.assertEqual(out.dtype, np.uint8)
        self.assertEqual(out[0, 160], 0)  # top band is padding
        self.assertEqual(out[160, 160], 200)  # centre is the image
        self.assertEqual(out[160, 0], 200)  # full width used

    def test_letterbox_converts_colour_to_grayscale(self):
        out = preprocess.letterbox(Image.new("RGB", (400, 400), (255, 0, 0)))
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
        # same formula as ml/pipeline/build_dataset.py, checked on the committed manifest
        manifest = Path(__file__).resolve().parents[1] / "manifests" / "shenzhen_v1" / "manifest.csv"
        if not manifest.exists():
            self.skipTest("committed manifest not present")
        m = pd.read_csv(manifest, dtype={"patient_id": str, "group_id": str})
        self.assertEqual(prepare_data.dataset_version_hash(m), "702a4658c7447e13")


if __name__ == "__main__":
    unittest.main()
