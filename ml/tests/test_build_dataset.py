"""Tests for ml/pipeline/build_dataset.py (story E1-03).

Synthetic images only: no real or public patient data is used here.
Run from the repo root: python3 -m unittest discover -s ml/tests -v
"""

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import build_dataset as bd  # noqa: E402


def make_image(path, seed, size=600):
    rng = np.random.default_rng(seed)
    Image.fromarray(rng.integers(0, 255, (size, size), dtype=np.uint8)).save(path)


def make_dataset(root, n=40, readings=True):
    """n synthetic patients, alternating labels, adults with consistent readings."""
    (root / "CXR_png").mkdir(parents=True)
    (root / "ClinicalReadings").mkdir()
    for i in range(1, n + 1):
        label = i % 2
        name = f"CHNCXR_{i:04d}_{label}"
        make_image(root / "CXR_png" / f"{name}.png", seed=i)
        if readings:
            finding = "PTB in the right upper field" if label else "normal"
            (root / "ClinicalReadings" / f"{name}.txt").write_text(f"male 40yrs\n{finding}\n")


class TestHelpers(unittest.TestCase):
    def test_parse_name(self):
        self.assertEqual(bd.parse_name("CHNCXR_0012_1.png"), ("0012", 1))
        self.assertIsNone(bd.parse_name("CHNCXR_12_1.png"))
        self.assertIsNone(bd.parse_name("CHNCXR_0012_2.png"))

    def test_parse_reading(self):
        self.assertEqual(bd.parse_reading("Male 45yrs\nnormal\n"), ("male", 45, "normal"))
        self.assertEqual(bd.parse_reading("female, 23 years\r\nPTB in left\n")[:2], ("female", 23))
        self.assertEqual(bd.parse_reading("male 8months\nnormal")[1], 0)
        self.assertIsNone(bd.parse_reading("male\nnormal")[1])

    def test_label_conflicts(self):
        self.assertFalse(bd.label_conflicts(0, "normal"))
        self.assertFalse(bd.label_conflicts(1, "PTB in the left upper field"))
        self.assertTrue(bd.label_conflicts(0, "PTB in the left upper field"))
        self.assertTrue(bd.label_conflicts(1, "normal"))

    def test_near_duplicate_groups(self):
        groups, pairs = bd.near_duplicate_groups(["a", "b", "c"], [0b0, 0b11, 0xFFFFFFFF])
        self.assertEqual(groups[0], groups[1])
        self.assertNotEqual(groups[0], groups[2])
        self.assertEqual(len(pairs), 1)

    def test_dhash_survives_resize(self):
        with tempfile.TemporaryDirectory() as d:
            make_image(Path(d) / "a.png", seed=1)
            with Image.open(Path(d) / "a.png") as im:
                h1 = bd.dhash(im)
                h2 = bd.dhash(im.resize((300, 300)))
        self.assertLessEqual(bd.hamming(h1, h2), bd.NEAR_DUP_BITS)

    def test_assign_splits_deterministic_and_complete(self):
        groups = pd.DataFrame({"group_id": [f"{i:04d}" for i in range(100)], "label": [i % 2 for i in range(100)]})
        a, b = bd.assign_splits(groups), bd.assign_splits(groups)
        self.assertEqual(a, b)
        self.assertEqual(len(a), 100)
        self.assertEqual(sorted(set(a.values())), ["test", "train", "val"])


class TestPipeline(unittest.TestCase):
    def setUp(self):
        self._min, self._gap = bd.MIN_RECORDS, bd.MAX_PREVALENCE_GAP
        bd.MIN_RECORDS = 10
        bd.MAX_PREVALENCE_GAP = 0.25  # tiny synthetic splits cannot hold a 5-point gap
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        bd.MIN_RECORDS, bd.MAX_PREVALENCE_GAP = self._min, self._gap
        self.tmp.cleanup()

    def run_pipeline(self):
        return bd.run(self.root / "raw", self.root / "out", self.root / "private")

    def test_end_to_end_quarantines_and_never_leaks(self):
        raw = self.root / "raw"
        make_dataset(raw)
        # one paediatric case, one label conflict, one corrupt file, one exact duplicate
        (raw / "ClinicalReadings" / "CHNCXR_0001_1.txt").write_text("male 9yrs\nPTB in left\n")
        (raw / "ClinicalReadings" / "CHNCXR_0002_0.txt").write_text("female 30yrs\nPTB in right upper field\n")
        (raw / "CXR_png" / "CHNCXR_0003_1.png").write_bytes(b"not a png")
        (raw / "CXR_png" / "CHNCXR_0041_0.png").write_bytes((raw / "CXR_png" / "CHNCXR_0004_0.png").read_bytes())
        (raw / "ClinicalReadings" / "CHNCXR_0041_0.txt").write_text("male 50yrs\nnormal\n")

        report = self.run_pipeline()
        q = pd.read_csv(self.root / "out" / "quarantine.csv")
        self.assertEqual(set(q["check"]), {"intended_population", "label_vs_reading", "decodable", "exact_duplicate"})
        m = pd.read_csv(self.root / "out" / "manifest.csv", dtype={"patient_id": str, "group_id": str})
        self.assertEqual(len(m) + len(q), 41)
        self.assertEqual(m.groupby("group_id")["split"].nunique().max(), 1)
        self.assertTrue(all(c["passed"] for c in report["batch_checks"]))
        # committed outputs hold no personal fields
        for col in ("sex", "age", "finding"):
            self.assertNotIn(col, m.columns)
        self.assertNotIn("9yrs", " ".join(q["reason"].astype(str)))

    def test_same_input_same_version_hash(self):
        make_dataset(self.root / "raw")
        h1 = self.run_pipeline()["dataset_version_hash"]
        h2 = self.run_pipeline()["dataset_version_hash"]
        self.assertEqual(h1, h2)

    def test_missing_readings_hard_fail(self):
        make_dataset(self.root / "raw", readings=False)
        with self.assertRaises(bd.HardFail):
            self.run_pipeline()
        self.assertFalse((self.root / "out" / "manifest.csv").exists())

    def test_too_few_records_hard_fail(self):
        make_dataset(self.root / "raw", n=6)
        with self.assertRaises(bd.HardFail):
            self.run_pipeline()


if __name__ == "__main__":
    unittest.main()
