"""Tests for ml/pipeline/build_dr.py (story E3-01).

Synthetic images only: no real or public patient data is used here.
Run from the repo root: python3 -m unittest discover -s ml/tests -v
"""

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import build_dr as dr  # noqa: E402
from build_dataset import HardFail, hamming  # noqa: E402


def fundus(seed, size=(520, 440), disc=0.8):
    """A textured bright disc on a black frame, like a fundus photo."""
    rng = np.random.default_rng(seed)
    w, h = size
    tex = rng.integers(60, 230, (h // 8, w // 8, 3), dtype=np.uint8)
    img = Image.fromarray(tex).resize((w, h), Image.NEAREST)
    mask = Image.new("L", (w, h), 0)
    r = int(min(w, h) * disc / 2)
    ImageDraw.Draw(mask).ellipse((w // 2 - r, h // 2 - r, w // 2 + r, h // 2 + r), fill=255)
    out = Image.new("RGB", (w, h))
    out.paste(img, mask=mask)
    return out


def make_sources(root, n_aptos=30, n_patients=30):
    a, e = root / "aptos", root / "eyepacs"
    (a / "train_images").mkdir(parents=True)
    (e / "train").mkdir(parents=True)
    rows = []
    for i in range(n_aptos):
        code = f"{i:012x}"
        fundus(i).save(a / "train_images" / f"{code}.png")
        rows.append((code, i % 5))
    pd.DataFrame(rows, columns=["id_code", "diagnosis"]).to_csv(a / "train.csv", index=False)
    rows = []
    for p in range(n_patients):
        for k, eye in enumerate(("left", "right")):
            name = f"{p + 10}_{eye}"
            fundus(1000 + 2 * p + k).save(e / "train" / f"{name}.jpeg", quality=95)
            rows.append((name, (p + k) % 5))
    pd.DataFrame(rows, columns=["image", "level"]).to_csv(e / "trainLabels.csv", index=False)
    return a, e


class Helpers(unittest.TestCase):
    def test_eyepacs_names_give_patient_and_eye(self):
        with tempfile.TemporaryDirectory() as t:
            e = Path(t)
            pd.DataFrame({"image": ["10_left", "10_right", "bad"], "level": [0, 2, 1]}).to_csv(
                e / "trainLabels.csv", index=False)
            recs = dr.read_eyepacs(e)
        self.assertEqual([r["patient_id"] for r in recs[:2]], ["eyepacs-10", "eyepacs-10"])
        self.assertEqual(recs[1]["eye"], "right")
        self.assertFalse(recs[2]["name_ok"])

    def test_changed_label_columns_stop_the_run(self):
        with tempfile.TemporaryDirectory() as t:
            pd.DataFrame({"id": ["x"], "grade": [0]}).to_csv(Path(t) / "train.csv", index=False)
            with self.assertRaises(HardFail):
                dr.read_aptos(Path(t))

    def test_subsample_keeps_whole_patients_and_is_deterministic(self):
        recs = [{"patient_id": f"p{p}", "grade": p % 5, "eye": eye} for p in range(200) for eye in "LR"]
        a = dr.subsample_patients(recs, 100)
        self.assertEqual(a, dr.subsample_patients(recs, 100))
        self.assertAlmostEqual(len(a), 100, delta=10)
        per = pd.Series([r["patient_id"] for r in a]).value_counts()
        self.assertTrue((per == 2).all())
        self.assertEqual(len(dr.subsample_patients(recs, 1000)), 400)

    def test_crop_removes_border_and_squares(self):
        img = fundus(1, size=(800, 500), disc=0.9)
        box, frac = dr.fundus_box(img)
        self.assertGreater(frac, 0.3)
        self.assertLess(box[2] - box[0], 800)  # side borders cropped
        out = dr.crop_fundus(img, side=256)
        self.assertEqual(out.size, (256, 256))
        with self.assertRaises(ValueError):
            dr.crop_fundus(Image.new("RGB", (100, 100)))

    def test_banded_search_matches_all_pairs(self):
        rng = np.random.default_rng(0)
        base = [int(rng.integers(0, 2**62)) << 194 | int(rng.integers(0, 2**62)) for _ in range(40)]
        hashes = base + [h ^ (1 << int(rng.integers(0, 256))) ^ (1 << 7) for h in base[:15]]
        brute = sorted((i, j, hamming(hashes[i], hashes[j])) for i in range(len(hashes))
                       for j in range(i + 1, len(hashes)) if hamming(hashes[i], hashes[j]) <= 12)
        self.assertTrue(brute)
        self.assertEqual(dr.near_pairs(hashes), brute)

    def test_groups_join_patients_and_near_copies(self):
        g = dr.union_groups(["a", "b", "a", "c"], [(1, 3, 2)])
        self.assertEqual(g[0], g[2])
        self.assertEqual(g[1], g[3])
        self.assertNotEqual(g[0], g[1])


class Pipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.a, self.e = make_sources(self.root)
        self.out, self.priv = self.root / "out", self.root / "private"
        self.old_min = dr.MIN_RECORDS
        dr.MIN_RECORDS = 20
        self.old_gap = dr.MAX_REFERABLE_GAP
        dr.MAX_REFERABLE_GAP = 0.5  # tiny synthetic set: split rates are noisy

    def tearDown(self):
        dr.MIN_RECORDS, dr.MAX_REFERABLE_GAP = self.old_min, self.old_gap
        self.tmp.cleanup()

    def run_pipeline(self, **kw):
        return dr.run(self.a, self.e, self.out, self.priv, **kw)

    def test_end_to_end_without_leakage(self):
        rep = self.run_pipeline(eyepacs_target=40)
        m = pd.read_csv(self.out / "manifest.csv")
        self.assertEqual(rep["records_kept"], len(m))
        self.assertEqual(m.groupby("patient_id")["split"].nunique().max(), 1)
        self.assertTrue(((m["grade"] >= 2) == (m["referable"] == 1)).all())
        self.assertEqual(set(m["source"]), {"aptos", "eyepacs"})
        self.assertTrue((self.priv / "images" / m["file"].iloc[0]).exists())
        for col in ("sex", "age", "path"):
            self.assertNotIn(col, m.columns)
        self.assertIn("train", rep["class_balance"])

    def test_same_inputs_same_version_hash(self):
        h1 = self.run_pipeline(write_copies=False)["dataset_version_hash"]
        h2 = self.run_pipeline(write_copies=False)["dataset_version_hash"]  # second run uses the cache
        self.assertEqual(h1, h2)

    def test_bad_records_are_quarantined_not_dropped(self):
        Image.new("RGB", (500, 500)).save(self.a / "train_images" / f"{0:012x}.png")  # blank
        fundus(5, size=(300, 300)).save(self.a / "train_images" / f"{1:012x}.png")  # too small
        (self.a / "train_images" / f"{2:012x}.png").unlink()  # missing
        fundus(7).save(self.a / "train_images" / f"{3:012x}.png")  # copy of image 7 ...
        rep = self.run_pipeline(write_copies=False)  # ... with grade 3 vs 2: conflict
        qdf = pd.read_csv(self.out / "quarantine.csv", dtype={"image_id": str})
        by = dict(zip(qdf["image_id"], qdf["check"]))
        self.assertEqual(by[f"{0:012x}"], "fundus_present")
        self.assertEqual(by[f"{1:012x}"], "min_resolution")
        self.assertEqual(by[f"{2:012x}"], "file_present")
        self.assertEqual(by[f"{3:012x}"], "duplicate_grade_conflict")
        self.assertEqual(by[f"{7:012x}"], "duplicate_grade_conflict")
        self.assertEqual(rep["records_kept"] + rep["records_quarantined"], 30 + 60)

    def test_too_few_records_is_a_hard_fail(self):
        dr.MIN_RECORDS = 10_000
        with self.assertRaises(HardFail):
            self.run_pipeline(write_copies=False)
        self.assertTrue((self.out / "batch_checks_failed.json").exists())
        self.assertFalse((self.out / "manifest.csv").exists())


if __name__ == "__main__":
    unittest.main()
