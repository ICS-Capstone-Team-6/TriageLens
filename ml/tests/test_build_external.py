"""Tests for the Montgomery external-set pipeline (story E11-01). Synthetic images and
made-up readings only: no real data."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import build_dataset as bd  # noqa: E402
import build_external as be  # noqa: E402


def noise_image(path, seed, size=(600, 700)):
    rng = np.random.default_rng(seed)
    Image.fromarray(rng.integers(0, 256, (size[1], size[0]), dtype=np.uint8)).save(path)


def make_set(root, normal=80, tb=58, age=40, finding_tb="right upper lobe granuloma"):
    """A fake Montgomery folder with NLM-style readings and a Kaggle-style CSV."""
    img_dir, rd_dir = root / "images" / "images", root / "ClinicalReadings"
    img_dir.mkdir(parents=True)
    rd_dir.mkdir()
    rows = []
    for i in range(normal + tb):
        label = int(i >= normal)
        stem = f"MCUCXR_{i:04d}_{label}"
        noise_image(img_dir / f"{stem}.png", seed=i)
        finding = finding_tb if label else "normal"
        (rd_dir / f"{stem}.txt").write_text(f"Patient's Sex: F\nPatient's Age: {age:03d}Y\n{finding}\n")
        rows.append({"study_id": f"{stem}.png", "age": str(age), "gender": "Female", "findings": finding})
    pd.DataFrame(rows).to_csv(root / "montgomery_metadata.csv", index=False)
    return img_dir, rd_dir


def empty_shenzhen(path):
    pd.DataFrame({"sha256": ["0" * 64], "dhash": ["0" * 64]}).to_csv(path, index=False)
    return path


class TestParsing(unittest.TestCase):
    def test_parse_reading(self):
        self.assertEqual(be.parse_reading("Patient's Sex: M\nPatient's Age: 040Y\nnormal\n"),
                         ("male", 40, "normal"))
        self.assertEqual(be.parse_reading("Patient's Sex: F\r\nPatient's Age: 009M\r\nnormal"),
                         ("female", 0, "normal"))  # months: under one year
        self.assertEqual(be.parse_reading("Patient's Sex: O\nPatient's Age: 052Y\nscars")[0], "other")

    def test_label_rule_accepts_tb_findings_without_the_word_tb(self):
        # Montgomery label 1 is TB (NLM); the finding often names only the lesion
        self.assertFalse(be.label_conflicts(1, "calcified granuloma right apex"))
        self.assertTrue(be.label_conflicts(1, "normal"))
        self.assertTrue(be.label_conflicts(0, "left upper lobe infiltrate"))
        self.assertFalse(be.label_conflicts(0, "normal."))

    def test_readings_naming_another_image_join_one_patient(self):
        ids = ["0001", "0002", "0003"]
        hashes = [0, (1 << 256) - 1, (1 << 128) - 1]  # 128 or more bits apart: no near duplicates
        groups, pairs, links = be.patient_groups(ids, hashes, ["scars", "same as MCUCXR_0001", "normal"])
        self.assertEqual(groups[0], groups[1])
        self.assertNotEqual(groups[0], groups[2])
        self.assertEqual(links, [("0002", "0001")])
        self.assertEqual(pairs, [])


class TestRun(unittest.TestCase):
    def run_pipeline(self, root, **kw):
        make_set(root / "raw", **kw)
        return be.run(root / "raw", root / "out", root / "private", empty_shenzhen(root / "sz.csv"))

    def test_full_run_marks_everything_external(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            report = self.run_pipeline(root)
            manifest = pd.read_csv(root / "out" / "manifest.csv")
            self.assertEqual(len(manifest), 138)
            self.assertEqual(set(manifest["split"]), {"external"})
            self.assertEqual(report["label_counts"], {"0": 80, "1": 58})
            self.assertEqual(report["csv_vs_readings_differences"], {})
            # public outputs carry no sex, age or reading text (Team Rules 8)
            self.assertFalse({"sex", "age", "finding"} & set(manifest.columns))
            self.assertTrue((root / "private" / "metadata_full.csv").exists())

    def test_children_are_quarantined(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            make_set(root / "raw")
            rd = root / "raw" / "ClinicalReadings" / "MCUCXR_0000_0.txt"
            rd.write_text("Patient's Sex: M\nPatient's Age: 008Y\nnormal\n")
            report = be.run(root / "raw", root / "out", root / "private", empty_shenzhen(root / "sz.csv"))
            self.assertEqual(report["records_kept"], 137)
            self.assertIn("intended_population", report["quarantine_by_check"])

    def test_image_also_in_shenzhen_is_quarantined(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            img_dir, _ = make_set(root / "raw")
            p = img_dir / "MCUCXR_0005_0.png"
            with Image.open(p) as im:
                h = bd.dhash(im)
            sz = root / "sz.csv"
            pd.DataFrame({"sha256": [bd.sha256_file(p)], "dhash": [f"{h:064x}"]}).to_csv(sz, index=False)
            report = be.run(root / "raw", root / "out", root / "private", sz)
            self.assertEqual(report["shenzhen_overlap"], 1)
            q = pd.read_csv(root / "out" / "quarantine.csv")
            self.assertEqual(q.loc[q["check"] == "training_source_overlap", "file"].tolist(), ["MCUCXR_0005_0.png"])

    def test_missing_readings_stop_the_run(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _, rd = make_set(root / "raw")
            (rd / "MCUCXR_0001_0.txt").unlink()
            with self.assertRaises(bd.HardFail):
                be.run(root / "raw", root / "out", root / "private", empty_shenzhen(root / "sz.csv"))

    def test_wrong_source_counts_stop_the_run(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with self.assertRaises(bd.HardFail):
                self.run_pipeline(root, tb=50)
            checks = json.loads((root / "out" / "batch_checks_failed.json").read_text())
            self.assertFalse(next(c for c in checks if c["check"] == "source_matches_nlm_counts")["passed"])


if __name__ == "__main__":
    unittest.main()
