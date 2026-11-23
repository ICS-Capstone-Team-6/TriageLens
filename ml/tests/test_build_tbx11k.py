"""Tests for the TBX11K pipeline (story E1-03). Synthetic images and made-up lists and
annotations only: no real data."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import build_dataset as bd  # noqa: E402
import build_tbx11k as bt  # noqa: E402

SMALL = {"train": {"health": 20, "sick": 20, "tb": 6}, "val": {"health": 10, "sick": 10, "tb": 4}}


def noise_image(path, seed, size=512):
    rng = np.random.default_rng(seed)
    Image.fromarray(rng.integers(0, 256, (size, size), dtype=np.uint8)).save(path)


def make_set(root, counts=SMALL, latent=("tb/tb0001.png",), extra_lines=(), nested=True):
    """A fake TBX11K tree: imgs/<class>/, lists/TBX11K_{train,val}.txt, COCO annotations."""
    base = root / "TBX11K" if nested else root
    for cls in ("health", "sick", "tb"):
        (base / "imgs" / cls).mkdir(parents=True)
    (base / "lists").mkdir()
    (base / "annotations" / "json").mkdir(parents=True)
    prefix = {"health": "h", "sick": "s", "tb": "tb"}
    seed, n = 0, {c: 0 for c in prefix}
    for split, by_class in counts.items():
        lines, images, anns = [], [], []
        for cls, k in by_class.items():
            for _ in range(k):
                n[cls] += 1
                rel = f"{cls}/{prefix[cls]}{n[cls]:04d}.png"
                noise_image(base / "imgs" / rel, seed)
                seed += 1
                lines.append(rel)
                if cls == "tb":
                    images.append({"id": len(images), "file_name": Path(rel).name})
                    cat = bt.LATENT if rel in latent else bt.ACTIVE
                    anns.append({"id": len(anns), "image_id": len(images) - 1, "category_id": cat})
        if split == "train":
            lines += list(extra_lines)
        (base / "lists" / bt.LIST_FILES[split]).write_text("\n".join(lines) + "\n")
        (base / "annotations" / "json" / f"TBX11K_{split}.json").write_text(
            json.dumps({"images": images, "annotations": anns, "categories": []}))
    return base


def other_manifest(path, images=()):
    """A committed-manifest stand-in with the hashes of the given image files."""
    rows = [{"sha256": "0" * 64, "dhash": "0" * 64}]
    for p in images:
        with Image.open(p) as im:
            rows.append({"sha256": bd.sha256_file(p), "dhash": f"{bd.dhash(im):064x}"})
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


class TestHelpers(unittest.TestCase):
    def test_parse_list_entry(self):
        self.assertEqual(bt.parse_list_entry("tb/tb0003.png\n"), "tb/tb0003.png")
        self.assertEqual(bt.parse_list_entry("imgs/health/h0001.png 0"), "health/h0001.png")
        self.assertEqual(bt.parse_list_entry("./sick/s0002.png"), "sick/s0002.png")
        self.assertIsNone(bt.parse_list_entry("   "))
        self.assertIsNone(bt.ENTRY_RE.match(bt.parse_list_entry("extra/da/x.png")))

    def test_near_pairs_matches_the_shenzhen_pairwise_loop(self):
        rng = np.random.default_rng(3)
        hashes = [int.from_bytes(rng.bytes(32), "big") for _ in range(60)]
        # plant near copies: flip 5 and 12 bits (in), 13 bits (out)
        hashes += [hashes[0] ^ ((1 << 5) - 1), hashes[1] ^ ((1 << 12) - 1), hashes[2] ^ ((1 << 13) - 1)]
        ids = [str(i) for i in range(len(hashes))]
        _, ref = bd.near_duplicate_groups(ids, hashes)
        got = [(ids[i], ids[j], d) for i, j, d in bt.near_pairs(hashes)]
        self.assertEqual(sorted(got), sorted(ref))
        self.assertEqual({(a, b) for a, b, _ in got}, {("0", "60"), ("1", "61")})

    def test_cross_matches(self):
        a = [0, (1 << 256) - 1]  # all zeros (2 bits from 3) and all ones (254 bits from 3)
        self.assertEqual(bt.cross_matches(a, [3]), [2, None])
        self.assertEqual(bt.cross_matches(a, []), [None, None])

    def test_tb_subtypes(self):
        with tempfile.TemporaryDirectory() as d:
            ann = Path(d) / "json"
            ann.mkdir()
            # all_*.json also covers the bundled extra sets: must be ignored
            (ann / "all_train.json").write_text(json.dumps({
                "images": [{"id": 9, "file_name": "tb0009.png"}],
                "annotations": [{"image_id": 9, "category_id": 1}]}))
            (ann / "TBX11K_a.json").write_text(json.dumps({
                "images": [{"id": 1, "file_name": "tb/tb0001.png"}, {"id": 2, "file_name": "tb0002.png"},
                           {"id": 3, "file_name": "tb0003.png"}, {"id": 4, "file_name": "tb0004.png"}],
                "annotations": [{"image_id": 1, "category_id": 1}, {"image_id": 2, "category_id": 2},
                                {"image_id": 3, "category_id": 1}, {"image_id": 3, "category_id": 2},
                                {"image_id": 4, "category_id": 3}]}))
            (ann / "TBX11K_not_coco.json").write_text("[1, 2]")
            got = bt.tb_subtypes(Path(d))
        self.assertEqual(got, {"tb0001.png": "active", "tb0002.png": "latent", "tb0003.png": "active_and_latent"})

    def test_assign_splits_keeps_groups_together_and_val_only_divided(self):
        df = pd.DataFrame({
            "group_id": ["a", "b", "b", "c", "d", "e", "f"],
            "source_split": ["train", "train", "val", "val", "val", "val", "val"],
            "label": [0, 1, 1, 0, 0, 1, 1]})
        s = bt.assign_splits(df)
        self.assertEqual(s["a"], "train")
        self.assertEqual(s["b"], "train")  # touches official train: whole group to train
        self.assertEqual(sorted(s[g] for g in "cd"), ["test", "val"])
        self.assertEqual(sorted(s[g] for g in "ef"), ["test", "val"])
        self.assertEqual(s, bt.assign_splits(df))  # deterministic


@mock.patch.object(bd, "MIN_RECORDS", 10)
class TestRun(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.raw = self.root / "raw"
        self.out, self.private = self.root / "out", self.root / "private"

    def tearDown(self):
        self.tmp.cleanup()

    def others(self, images=()):
        return {"Shenzhen": other_manifest(self.root / "sz.csv", images),
                "Montgomery": other_manifest(self.root / "mc.csv")}

    def test_end_to_end(self):
        make_set(self.raw, extra_lines=("extra/da/da0001.png",))
        r = bt.run(self.raw, self.out, self.private, self.others(), expected=SMALL)
        m = pd.read_csv(self.out / "manifest.csv")
        self.assertEqual(r["records_kept"], 70)
        self.assertEqual(r["image_root"], "TBX11K/imgs")
        # sick is not TB; latent TB counts as TB
        self.assertTrue((m.loc[m["source_class"] == "sick", "label"] == 0).all())
        row = m[m["file"] == "tb/tb0001.png"].iloc[0]
        self.assertEqual((row["label"], row["tb_subtype"]), (1, "latent"))
        self.assertEqual(r["tb_subtype_counts"], {"active": 9, "latent": 1})
        # official train stays train; official val becomes val and test
        self.assertTrue((m.loc[m["source_split"] == "train", "split"] == "train").all())
        self.assertEqual(set(m.loc[m["source_split"] == "val", "split"]), {"val", "test"})
        # the bundled extra entry is quarantined, not used
        qd = pd.read_csv(self.out / "quarantine.csv")
        self.assertEqual(qd["check"].tolist(), ["list_entry_schema"])
        self.assertTrue(all(c["passed"] for c in r["batch_checks"]))

    def test_same_output_twice(self):
        make_set(self.raw)
        a = bt.run(self.raw, self.out, self.private, self.others(), expected=SMALL)
        b = bt.run(self.raw, self.out, self.private, self.others(), expected=SMALL)  # cached
        self.assertEqual(a["dataset_version_hash"], b["dataset_version_hash"])

    def test_count_mismatch_stops(self):
        make_set(self.raw)
        wrong = {"train": dict(SMALL["train"], tb=7), "val": SMALL["val"]}
        with self.assertRaisesRegex(bd.HardFail, "official table"):
            bt.run(self.raw, self.out, self.private, self.others(), expected=wrong)
        self.assertFalse((self.out / "manifest.csv").exists())

    def test_missing_list_stops(self):
        base = make_set(self.raw)
        (base / "lists" / "TBX11K_val.txt").unlink()
        with self.assertRaisesRegex(bd.HardFail, "TBX11K_val.txt"):
            bt.run(self.raw, self.out, self.private, self.others(), expected=SMALL)

    def test_image_in_both_lists_stops(self):
        base = make_set(self.raw)
        with open(base / "lists" / "TBX11K_val.txt", "a") as f:
            f.write("health/h0001.png\n")
        with self.assertRaisesRegex(bd.HardFail, "both"):
            bt.run(self.raw, self.out, self.private, self.others(), expected=SMALL)

    def test_other_source_overlap_is_quarantined(self):
        base = make_set(self.raw, nested=False)
        hit = base / "imgs" / "health" / "h0003.png"
        r = bt.run(self.raw, self.out, self.private, self.others([hit]), expected=SMALL)
        m = pd.read_csv(self.out / "manifest.csv")
        self.assertNotIn("health/h0003.png", set(m["file"]))
        self.assertEqual(r["other_source_overlap"], {"Shenzhen": 1})

    def test_near_duplicates(self):
        base = make_set(self.raw)
        imgs = base / "imgs"
        # a val health image that is a resized copy of a train health image: grouped, moved to train
        with Image.open(imgs / "health/h0001.png") as im:
            im.resize((520, 520)).save(imgs / "health/h0021.png")
        # a train sick image identical to a train TB image: both quarantined
        with Image.open(imgs / "tb/tb0002.png") as im:
            im.save(imgs / "sick/s0005.png")
        r = bt.run(self.raw, self.out, self.private, self.others(), expected=SMALL)
        m = pd.read_csv(self.out / "manifest.csv").set_index("file")
        self.assertEqual(m.loc["health/h0021.png", "split"], "train")
        self.assertEqual(m.loc["health/h0021.png", "group_id"], m.loc["health/h0001.png", "group_id"])
        self.assertEqual(r["val_records_moved_to_train"], 1)
        qd = pd.read_csv(self.out / "quarantine.csv")
        self.assertEqual(sorted(qd.loc[qd["check"] == "duplicate_label_conflict", "file"]),
                         ["sick/s0005.png", "tb/tb0002.png"])

    def test_small_image_quarantined(self):
        base = make_set(self.raw)
        noise_image(base / "imgs" / "health/h0002.png", 999, size=256)
        bt.run(self.raw, self.out, self.private, self.others(), expected=SMALL)
        qd = pd.read_csv(self.out / "quarantine.csv")
        self.assertEqual(qd["check"].tolist(), ["min_resolution"])


if __name__ == "__main__":
    unittest.main()
