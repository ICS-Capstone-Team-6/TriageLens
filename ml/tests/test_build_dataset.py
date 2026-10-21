"""Tests for ml/pipeline/build_dataset.py (story E1-03).

Synthetic images only: no real or public patient data is used here.
Run from the repo root: python3 -m unittest discover -s ml/tests -v
"""

import sys
import os
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

    def test_parse_reading_real_world_formats(self):
        # formats seen in the Shenzhen readings: typo, no space, singular unit, comma, tabs
        self.assertEqual(bd.parse_reading("femal 30yrs\r\nnormal")[:2], ("female", 30))
        self.assertEqual(bd.parse_reading("male45yrs  \t\r\nnormal")[:2], ("male", 45))
        self.assertEqual(bd.parse_reading("Male , 50yrs  \t\r\nbilateral PTB \t")[:2], ("male", 50))
        self.assertEqual(bd.parse_reading("female 61yr\r\nnormal")[:2], ("female", 61))
        self.assertEqual(bd.parse_reading("female  29yrs\nnormale")[2], "normale")

    def test_abnormal_but_not_tb_conflicts(self):
        # the source label 1 means "abnormal lung"; the TB task needs TB in the reading
        self.assertTrue(bd.label_conflicts(1, "right upper pneumonia"))
        self.assertFalse(bd.label_conflicts(1, "bilateral secondary PTB"))
        self.assertFalse(bd.label_conflicts(1, "tuberculosis, right upper lobe"))
        self.assertFalse(bd.label_conflicts(0, "normale"))

    def test_label_conflicts(self):
        self.assertFalse(bd.label_conflicts(0, "normal"))
        self.assertFalse(bd.label_conflicts(1, "PTB in the left upper field"))
        self.assertTrue(bd.label_conflicts(0, "PTB in the left upper field"))
        self.assertTrue(bd.label_conflicts(1, "normal"))

    def test_near_duplicate_groups(self):
        groups, pairs = bd.near_duplicate_groups(["a", "b", "c"], [0, 0b111, (1 << 256) - 1])
        self.assertEqual(groups[0], groups[1])
        self.assertNotEqual(groups[0], groups[2])
        self.assertEqual(len(pairs), 1)

    def test_patient_identity_links_near_duplicate_components(self):
        # a's dissimilar images each match a different patient's image.
        groups, _ = bd.near_duplicate_groups(
            ["a", "a", "b", "c"], [0, (1 << 256) - 1, 1, (1 << 256) - 2])
        self.assertEqual(len(set(groups)), 1)

    def test_batch_checks_detect_patient_leakage_independently(self):
        df = pd.DataFrame({"patient_id": ["a", "a", "b"],
                           "group_id": ["x", "y", "z"],
                           "sha256": ["1", "2", "3"],
                           "split": ["train", "test", "val"], "label": [0, 1, 0]})
        checks = {c["check"]: c["passed"] for c in bd.batch_checks(df)}
        self.assertFalse(checks["no_patient_across_splits"])

    def test_negated_uncertain_and_mixed_readings_go_to_review(self):
        for finding in ["No evidence of tuberculosis", "TB ruled out", "without PTB", "tuberculin test",
                        "negative for TB", "not tuberculosis", "rule out TB",
                        "possible PTB", "cannot exclude tuberculosis", "suspected TB",
                        "normal lungs; no TB", "Normal left lung; right upper lobe PTB"]:
            with self.subTest(finding=finding):
                self.assertTrue(bd.label_conflicts(1, finding))
        for finding in ["Normal left lung; right upper lobe PTB", "normally aerated left lung",
                        "normal; right pneumonia", "normal except scarring"]:
            with self.subTest(finding=finding):
                self.assertTrue(bd.label_conflicts(0, finding))
        self.assertTrue(bd.label_conflicts(1, "softball injury"))

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

    def test_same_patient_stays_in_one_split_end_to_end(self):
        raw = self.root / "raw"
        make_dataset(raw)
        make_image(raw / "CXR_png" / "CHNCXR_0001_0.png", seed=1001)
        (raw / "ClinicalReadings" / "CHNCXR_0001_0.txt").write_text("male 40yrs\nnormal\n")
        self.run_pipeline()
        m = pd.read_csv(self.root / "out" / "manifest.csv", dtype={"patient_id": str})
        self.assertEqual(len(m[m["patient_id"] == "0001"]), 2)
        self.assertEqual(m.groupby("patient_id")["split"].nunique().max(), 1)

    def test_cache_rechecks_corruption_with_unchanged_size_and_mtime(self):
        raw = self.root / "raw"
        make_dataset(raw)
        before = self.run_pipeline()["dataset_version_hash"]
        p = raw / "CXR_png" / "CHNCXR_0001_1.png"
        st = p.stat()
        data = p.read_bytes()
        p.write_bytes(b"badbytes" + data[8:])
        os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns))
        after = self.run_pipeline()["dataset_version_hash"]
        self.assertNotEqual(before, after)
        q = pd.read_csv(self.root / "out" / "quarantine.csv")
        self.assertIn("CHNCXR_0001_1.png", set(q.loc[q["check"] == "decodable", "file"]))

    def test_stricter_rule_keeps_every_remaining_patient_in_its_split(self):
        # Option 1 (21 Oct 2026): a new rule removes records, but nobody moves split,
        # so a model trained on v1 never meets its own training images in v2's test split.
        raw = self.root / "raw"
        make_dataset(raw, n=60)
        bd.run(raw, self.root / "v1", self.root / "p1")
        v1 = pd.read_csv(self.root / "v1" / "manifest.csv")
        for name in ("CHNCXR_0003_1", "CHNCXR_0011_1", "CHNCXR_0021_1"):
            (raw / "ClinicalReadings" / f"{name}.txt").write_text("male 40yrs\npossible PTB?\n")
        report = bd.run(raw, self.root / "v2", self.root / "p2", self.root / "v1" / "manifest.csv")
        v2 = pd.read_csv(self.root / "v2" / "manifest.csv")
        self.assertEqual(len(v2), len(v1) - 3)
        both = v2.merge(v1[["file", "split"]], on="file", suffixes=("", "_v1"))
        self.assertEqual(len(both), len(v2))
        self.assertTrue((both["split"] == both["split_v1"]).all())
        self.assertEqual(report["split_source"]["new"], 0)
        self.assertEqual(report["split_source"]["carried"], len(v2))

    def test_new_patients_are_split_and_old_ones_stay(self):
        df = pd.DataFrame({"file": ["a.png", "b.png", "c.png", "d.png"], "group_id": ["1", "2", "3", "4"],
                           "label": [0, 1, 0, 1]})
        prior = self.root / "prior.csv"
        pd.DataFrame({"file": ["a.png", "b.png"], "patient_id": ["1", "2"], "split": ["test", "val"]}).to_csv(prior, index=False)
        splits, counts = bd.carry_splits(df, prior)
        self.assertEqual((splits["1"], splits["2"]), ("test", "val"))
        self.assertIn(splits["3"], {"train", "val", "test"})
        self.assertEqual(counts, {"carried": 2, "new": 2})

    def test_group_spanning_two_prior_splits_hard_fails(self):
        df = pd.DataFrame({"file": ["a.png", "b.png"], "group_id": ["1", "1"], "label": [1, 1]})
        prior = self.root / "prior.csv"
        pd.DataFrame({"file": ["a.png", "b.png"], "patient_id": ["1", "2"], "split": ["train", "test"]}).to_csv(prior, index=False)
        with self.assertRaises(bd.HardFail):
            bd.carry_splits(df, prior)

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
