"""Tests for ml/testenv/make_synthetic.py (story E1-03, Section D test environment)."""

import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "testenv"))
import build_dataset as bd  # noqa: E402
import make_synthetic as ms  # noqa: E402


class TestSyntheticEnv(unittest.TestCase):
    def setUp(self):
        self._min, self._gap = bd.MIN_RECORDS, bd.MAX_PREVALENCE_GAP
        bd.MIN_RECORDS, bd.MAX_PREVALENCE_GAP = 10, 0.25
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        bd.MIN_RECORDS, bd.MAX_PREVALENCE_GAP = self._min, self._gap
        self.tmp.cleanup()

    def test_every_reading_parses(self):
        ms.generate(self.root / "raw", n=60)
        for p in (self.root / "raw" / "ClinicalReadings").glob("*.txt"):
            sex, age, finding = bd.parse_reading(p.read_text())
            self.assertIn(sex, ("male", "female"), p.name)
            self.assertIsNotNone(age, p.name)
            label = int(p.stem[-1])
            self.assertFalse(bd.label_conflicts(label, finding), p.name)

    def test_pipeline_accepts_clean_synthetic_set(self):
        ms.generate(self.root / "raw", n=60)
        report = bd.run(self.root / "raw", self.root / "out", self.root / "private")
        q = pd.read_csv(self.root / "out" / "quarantine.csv")
        self.assertTrue(set(q["check"]) <= {"intended_population"})
        self.assertEqual(report["records_kept"] + report["records_quarantined"], 60)

    def test_same_seed_same_files(self):
        ms.generate(self.root / "a", n=8)
        ms.generate(self.root / "b", n=8)
        for p in sorted((self.root / "a").rglob("*.*")):
            other = self.root / "b" / p.relative_to(self.root / "a")
            self.assertEqual(p.read_bytes(), other.read_bytes(), p.name)

    def test_flipped_label_is_caught(self):
        # the simplest attack: rename a normal image to label 1 without touching its reading
        raw = self.root / "raw"
        ms.generate(raw, n=60)
        src = next((raw / "CXR_png").glob("*_0.png"))
        stem = src.stem[:-2]
        src.rename(raw / "CXR_png" / f"{stem}_1.png")
        (raw / "ClinicalReadings" / f"{stem}_0.txt").rename(raw / "ClinicalReadings" / f"{stem}_1.txt")
        bd.run(raw, self.root / "out", self.root / "private")
        q = pd.read_csv(self.root / "out" / "quarantine.csv")
        self.assertIn(f"{stem}_1.png", set(q.loc[q["check"] == "label_vs_reading", "file"]))


if __name__ == "__main__":
    unittest.main()
