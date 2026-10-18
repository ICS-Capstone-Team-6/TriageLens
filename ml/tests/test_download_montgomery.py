"""Tests for ml/pipeline/download_montgomery.py with a fake kagglehub: no network, no real data."""

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import download_montgomery as dm  # noqa: E402


def fake_set(root, normal=80, tb=58, readings=True):
    """Empty stand-in files laid out like the NLM set, in a kagglehub-style versions/3 folder."""
    base = Path(root) / "versions" / "3"
    for i in range(normal + tb):
        label = 0 if i < normal else 1
        img = base / "images" / f"MCUCXR_{i:04d}_{label}.png"
        img.parent.mkdir(parents=True, exist_ok=True)
        img.write_bytes(bytes([i % 256]))
        if readings:
            txt = base / "ClinicalReadings" / f"MCUCXR_{i:04d}_{label}.txt"
            txt.parent.mkdir(parents=True, exist_ok=True)
            txt.write_text("Patient's Sex: F\nPatient's Age: 040Y\nnormal\n")
    return base


class TestDownloadMontgomery(unittest.TestCase):
    def run_with(self, cache, dest, *extra):
        fake = types.SimpleNamespace(dataset_download=lambda handle: str(cache))
        with mock.patch.dict(sys.modules, {"kagglehub": fake}), mock.patch("builtins.print"):
            return dm.main(["--dest", str(dest), *extra])

    def test_full_set_is_copied_and_recorded(self):
        with tempfile.TemporaryDirectory() as d:
            cache, dest = fake_set(Path(d) / "cache"), Path(d) / "raw" / "montgomery"
            self.assertEqual(self.run_with(cache, dest), 0)
            record = json.loads((dest / "SOURCE.json").read_text())
            self.assertEqual(record["version"], 3)  # read from the kagglehub path
            self.assertEqual(record["layout"]["tb_1"], 58)
            self.assertEqual(len(record["sha256"]), 276)  # every image and reading hashed
            self.assertFalse(cache.exists())  # one copy only, unless --keep-cache

    def test_missing_readings_are_flagged(self):
        with tempfile.TemporaryDirectory() as d:
            cache, dest = fake_set(Path(d) / "cache", readings=False), Path(d) / "m"
            self.assertEqual(self.run_with(cache, dest), 2)
            self.assertIn("clinical readings", " ".join(dm.problems(dm.layout(dest))))

    def test_check_only_sees_readings_added_later(self):
        # Kaggle version 1 has no readings; they are added from NLM, then re-checked
        with tempfile.TemporaryDirectory() as d:
            dest = Path(d) / "m"
            self.assertEqual(self.run_with(fake_set(Path(d) / "c", readings=False), dest), 2)
            readings = dest / "ClinicalReadings"
            readings.mkdir()
            for img in (dest / "images").glob("*.png"):
                (readings / f"{img.stem}.txt").write_text("Patient's Age: 040Y\n")
            self.assertEqual(self.run_with(Path(d) / "unused", dest, "--check-only"), 0)
            record = json.loads((dest / "SOURCE.json").read_text())
            self.assertEqual(record["version"], 3)
            self.assertEqual(record["layout"]["readings_matching_an_image"], 138)

    def test_wrong_counts_are_flagged(self):
        with tempfile.TemporaryDirectory() as d:
            dest = Path(d) / "m"
            self.assertEqual(self.run_with(fake_set(Path(d) / "c", tb=50), dest), 2)

    def test_existing_download_is_not_replaced_without_force(self):
        with tempfile.TemporaryDirectory() as d:
            dest = Path(d) / "m"
            dest.mkdir()
            (dest / "keep.txt").write_text("x")
            self.assertEqual(self.run_with(fake_set(Path(d) / "c"), dest), 1)
            self.assertTrue((dest / "keep.txt").exists())


if __name__ == "__main__":
    unittest.main()
