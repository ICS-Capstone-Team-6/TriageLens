"""Tests for the India DA/DB external-set pipeline (story E11-01). Synthetic images and
synthetic DICOM files only: no real data."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import build_dataset as bd  # noqa: E402
import build_india as bi  # noqa: E402

HAS_PYDICOM = importlib.util.find_spec("pydicom") is not None
SMALL = {"da": {"images": 8, "1": 4, "0": 4}, "db": {"images": 6, "1": 2, "0": 4}}


def write_dicom(path, pixels, photometric="MONOCHROME2"):
    """A minimal uncompressed DICOM, as in the DB set (16-bit, stripped headers)."""
    import pydicom
    from pydicom.dataset import FileDataset, FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid

    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.1"
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(str(path), {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID, ds.SOPInstanceUID = meta.MediaStorageSOPClassUID, meta.MediaStorageSOPInstanceUID
    ds.Rows, ds.Columns = pixels.shape
    ds.SamplesPerPixel, ds.PhotometricInterpretation = 1, photometric
    ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 16, 16, 15, 0
    ds.PixelData = pixels.astype(np.uint16).tobytes()
    ds.save_as(path, enforce_file_format=True)
    pydicom.dcmread(path)  # it must read back


def make_set(root, counts=SMALL, seed=0):
    """A fake Kaggle tree: images/da/*.jpg and images/db/*.dcm with the real naming scheme."""
    rng = np.random.default_rng(seed)
    base = root / "versions" / "1" / "images"
    for s in ("da", "db"):
        (base / s).mkdir(parents=True)
    for s in ("da", "db"):
        n_tb, n_norm = counts[s]["1"], counts[s]["0"]
        for k, label in enumerate([1] * n_tb + [0] * n_norm):
            split = "train" if k % 2 else "test"
            letter = "p" if label else "n"
            if s == "da":
                Image.fromarray(rng.integers(0, 256, (600, 600), dtype=np.uint8)).save(
                    base / s / f"da_{split}_{letter}x{k + 1}.jpg", quality=95)
            else:
                mid = "d" if split == "test" else ""
                write_dicom(base / s / f"db_{split}_{letter}{mid}{k + 1}.dcm",
                            rng.integers(0, 4096, (600, 600)).astype(np.uint16))
    return base


def other_manifest(path, images=()):
    rows = [{"sha256": "0" * 64, "dhash": "0" * 64}]
    for p in images:
        with Image.open(p) as im:
            rows.append({"sha256": bd.sha256_file(p), "dhash": f"{bd.dhash(im):064x}"})
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


class TestHelpers(unittest.TestCase):
    def test_parse_name(self):
        self.assertEqual(bi.parse_name("da_train_px12.jpg"), ("da", "train", 1))
        self.assertEqual(bi.parse_name("da_test_nx3.jpg"), ("da", "test", 0))
        self.assertEqual(bi.parse_name("db_test_pd149.dcm"), ("db", "test", 1))
        self.assertEqual(bi.parse_name("db_train_n7.dcm"), ("db", "train", 0))
        self.assertIsNone(bi.parse_name("db_train_q7.dcm"))
        self.assertIsNone(bi.parse_name("notes.txt"))

    def test_dicom_to_u8_window_and_inversion(self):
        a = np.linspace(0, 4095, 10000).reshape(100, 100)
        u = bi.dicom_to_u8(a, "MONOCHROME2")
        self.assertEqual(u.dtype, np.uint8)
        self.assertEqual((u.min(), u.max()), (0, 255))
        self.assertLess(u[0, 0], u[-1, -1])  # high value stays bright
        inv = bi.dicom_to_u8(a, "MONOCHROME1")
        self.assertGreater(inv[0, 0], inv[-1, -1])  # MONOCHROME1: high value is dark
        self.assertTrue(np.array_equal(u, bi.dicom_to_u8(a, "MONOCHROME2")))  # deterministic
        with self.assertRaises(ValueError):
            bi.dicom_to_u8(np.full((10, 10), 7), "MONOCHROME2")

    def test_window_ignores_a_few_extreme_pixels(self):
        a = np.full((100, 100), 2000.0)
        a[:50] = 1000
        a[0, 0] = 65535  # one burnt-in marker pixel must not squash the image
        u = bi.dicom_to_u8(a, "MONOCHROME2")
        self.assertGreater(int(u[99, 99]) - int(u[1, 1]), 100)  # 2000 vs 1000 stay far apart


@unittest.skipUnless(HAS_PYDICOM, "pydicom not installed (ml/requirements.txt)")
class TestRun(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.raw, self.out, self.stage = self.root / "raw", self.root / "out", self.root / "stage"

    def tearDown(self):
        self.tmp.cleanup()

    def others(self, images=()):
        return {"Shenzhen": other_manifest(self.root / "sz.csv", images),
                "Montgomery": other_manifest(self.root / "mc.csv"), "TBX11K": other_manifest(self.root / "tb.csv")}

    def test_end_to_end(self):
        make_set(self.raw)
        r = bi.run(self.raw, self.out, self.stage, self.others(), expected=SMALL)
        for s in ("da", "db"):
            m = pd.read_csv(self.out / s / "manifest.csv")
            self.assertEqual(len(m), SMALL[s]["images"])
            self.assertEqual(set(m["split"]), {"external"})  # locked by data.load_split
            self.assertEqual(int(m["label"].sum()), SMALL[s]["1"])
            for f, sha in zip(m["file"], m["sha256"]):  # staged files are what the manifest names
                self.assertEqual(bd.sha256_file(self.stage / "images" / f), sha)
            self.assertIn("age_check", r[s])
        db = pd.read_csv(self.out / "db" / "manifest.csv")
        self.assertTrue(db["file"].str.endswith(".png").all())
        self.assertEqual(set(db["how"]), {"dicom_to_png"})
        da = pd.read_csv(self.out / "da" / "manifest.csv")
        self.assertTrue((da["sha256"] == da["source_sha256"]).all())  # copied byte for byte
        with Image.open(self.stage / "images" / db["file"].iloc[0]) as im:
            self.assertEqual(im.mode, "L")

    def test_same_output_twice(self):
        make_set(self.raw)
        a = bi.run(self.raw, self.out, self.stage, self.others(), expected=SMALL)
        b = bi.run(self.raw, self.out, self.stage, self.others(), expected=SMALL)  # cached
        self.assertEqual({s: a[s]["dataset_version_hash"] for s in a}, {s: b[s]["dataset_version_hash"] for s in b})

    def test_count_mismatch_stops(self):
        make_set(self.raw)
        with self.assertRaisesRegex(bd.HardFail, "authors' folders"):
            bi.run(self.raw, self.out, self.stage, self.others(), expected=bi.EXPECTED)

    def test_training_source_overlap_is_quarantined(self):
        base = make_set(self.raw)
        hit = sorted((base / "da").iterdir())[0]
        r = bi.run(self.raw, self.out, self.stage, self.others([hit]), expected=SMALL)
        self.assertEqual(r["da"]["records_kept"], SMALL["da"]["images"] - 1)
        qd = pd.read_csv(self.out / "da" / "quarantine.csv")
        self.assertEqual(qd["check"].tolist(), ["other_source_overlap"])

    def test_image_in_both_sets_is_quarantined_in_both(self):
        base = make_set(self.raw)
        da0 = sorted((base / "da").iterdir())[0]
        db0 = sorted((base / "db").iterdir())[0]
        with Image.open(da0) as im:
            pixels = (np.asarray(im, dtype=np.uint16) * 16)
        write_dicom(db0, pixels)  # the same picture in DB
        r = bi.run(self.raw, self.out, self.stage, self.others(), expected=SMALL)
        self.assertEqual(r["da"]["quarantine_by_check"], {"other_source_overlap": 1})
        self.assertEqual(r["db"]["quarantine_by_check"], {"other_source_overlap": 1})

    def test_unreadable_dicom_is_quarantined(self):
        base = make_set(self.raw)
        sorted((base / "db").iterdir())[0].write_bytes(b"not a dicom")
        r = bi.run(self.raw, self.out, self.stage, self.others(), expected=SMALL)
        self.assertEqual(r["db"]["quarantine_by_check"], {"decodable": 1})


if __name__ == "__main__":
    unittest.main()
