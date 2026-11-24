"""Tests for combining training sources (story E1-03) and for preparing a source whose
images sit in class folders (TBX11K). Synthetic images only: no real data."""

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import combine_data  # noqa: E402
import metrics  # noqa: E402
import prepare_data  # noqa: E402
from test_train_core import make_raw  # noqa: E402


def make_nested_raw(root, n=30, seed=1):
    """Synthetic TBX11K-style folder: imgs/<class>/<name>.png. The same base name appears in
    two class folders, so keying by base name would mix them up."""
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        cls, label = ("tb", 1) if i % 3 == 0 else ("health", 0)
        rel = f"{cls}/img{i // 2:04d}.png"
        path = root / "TBX11K" / "imgs" / rel
        if path.exists():
            rel = f"sick/img{i // 2:04d}.png"
            label = 0
            path = root / "TBX11K" / "imgs" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rng.integers(0, 255, (512, 512), dtype=np.uint8)).save(path)
        data = path.read_bytes()
        split = ("train", "train", "val", "test")[i % 4]
        rows.append({"file": rel, "patient_id": rel[:-4], "group_id": rel[:-4], "label": label,
                     "split": split, "width": 512, "height": 512, "bytes": len(data),
                     "sha256": hashlib.sha256(data).hexdigest(), "dhash": "0"})
    manifest = root / "manifest.csv"
    pd.DataFrame(rows).to_csv(manifest, index=False)
    return manifest


def prepared_pair(root):
    """Two prepared sources: Shenzhen-style and TBX11K-style."""
    sz = make_raw(root / "sz_raw", n=30)
    tb = make_nested_raw(root / "tb_raw", n=30)
    prepare_data.prepare(root / "sz_raw", sz, root / "sz", workers=1)
    prepare_data.prepare(root / "tb_raw", tb, root / "tb", workers=1, img_subdir="TBX11K/imgs")
    return {"shenzhen": root / "sz", "tbx11k": root / "tb"}


class TestPrepareNested(unittest.TestCase):
    def test_class_folders_are_kept_apart(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_nested_raw(root / "raw")
            prepare_data.prepare(root / "raw", manifest, root / "out", workers=1, img_subdir="TBX11K/imgs")
            m = pd.read_csv(manifest)
            for split in prepare_data.SPLITS:
                with np.load(root / "out" / f"{split}.npz") as z:
                    rows = m[m["split"] == split].sort_values("file")
                    self.assertEqual(list(z["files"]), list(rows["file"]))
                    self.assertEqual(list(z["y"]), list(rows["label"]))
                    for f, x in zip(z["files"], z["x"]):  # each array is its own file's image
                        with Image.open(root / "raw" / "TBX11K" / "imgs" / f) as im:
                            self.assertTrue(np.array_equal(x, prepare_data.to_model_size(im)))


class TestCombine(unittest.TestCase):
    def test_joins_split_by_split_and_tags_the_source(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            sources = prepared_pair(root)
            report = combine_data.combine(sources, root / "combined")
            for split in prepare_data.SPLITS:
                with np.load(root / "combined" / f"{split}.npz") as z:
                    parts = {}
                    for name, folder in sources.items():
                        with np.load(folder / f"{split}.npz") as p:
                            parts[name] = {k: p[k] for k in p.files}
                    self.assertEqual(len(z["y"]), sum(len(p["y"]) for p in parts.values()))
                    for name, p in parts.items():
                        m = z["source"] == name
                        self.assertTrue(np.array_equal(z["x"][m], p["x"]))
                        self.assertTrue(np.array_equal(z["y"][m], p["y"]))
                        self.assertEqual(list(z["files"][m]), [f"{name}/{f}" for f in p["files"]])
                    self.assertEqual(report["splits"][split]["n"], len(z["y"]))
            components = {n: json.loads((f / "prepare_report.json").read_text())["dataset_version_hash"]
                          for n, f in sources.items()}
            self.assertEqual(report["dataset_version_hash"], combine_data.combined_version_hash(components))
            saved = json.loads((root / "combined" / "prepare_report.json").read_text())
            self.assertEqual(saved["preprocess_spec"], report["preprocess_spec"])

    def test_different_preprocessing_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            sources = prepared_pair(root)
            rp = sources["tbx11k"] / "prepare_report.json"
            r = json.loads(rp.read_text())
            r["preprocess_spec"] = "cxr-pre-1"
            rp.write_text(json.dumps(r))
            with self.assertRaisesRegex(ValueError, "different preprocessing"):
                combine_data.combine(sources, root / "combined")

    def test_needs_two_sources_and_safe_names(self):
        with self.assertRaises(ValueError):
            combine_data.combine({"shenzhen": "x"}, "out")
        with self.assertRaisesRegex(ValueError, "source name"):
            combine_data.combine({"Shen zhen": "x", "tbx11k": "y"}, "out")

    def test_version_hash_ignores_order(self):
        a = combine_data.combined_version_hash({"shenzhen": "aa", "tbx11k": "bb"})
        b = combine_data.combined_version_hash({"tbx11k": "bb", "shenzhen": "aa"})
        self.assertEqual(a, b)
        self.assertNotEqual(a, combine_data.combined_version_hash({"shenzhen": "aa", "tbx11k": "bc"}))


class TestSelection(unittest.TestCase):
    def test_a_source_shortcut_raises_pooled_but_not_selection_auroc(self):
        # Source A: half TB; source B: one in ten. The score only knows the source.
        y = np.array([1] * 50 + [0] * 50 + [1] * 10 + [0] * 90)
        src = np.array(["a"] * 100 + ["b"] * 100)
        score = (src == "a").astype(float)
        self.assertGreater(metrics.auroc(y, score), 0.6)
        self.assertAlmostEqual(combine_data.selection_auroc(y, score, src, metrics.auroc), 0.5)
        per = combine_data.per_source_auroc(y, score, src, metrics.auroc)
        self.assertEqual(per, {"a": 0.5, "b": 0.5})

    def test_one_source_is_plain_auroc(self):
        y, s = np.array([0, 0, 1, 1]), np.array([0.1, 0.4, 0.35, 0.8])
        self.assertEqual(combine_data.selection_auroc(y, s, None, metrics.auroc), metrics.auroc(y, s))
        self.assertEqual(combine_data.selection_auroc(y, s, np.array(["a"] * 4), metrics.auroc),
                         metrics.auroc(y, s))

    def test_source_with_one_class_is_left_out(self):
        y = np.array([0, 1, 0, 1, 0, 0])
        s = np.array([0.1, 0.9, 0.2, 0.8, 0.3, 0.4])
        src = np.array(["a", "a", "a", "a", "b", "b"])
        self.assertEqual(combine_data.per_source_auroc(y, s, src, metrics.auroc), {"a": 1.0})

    def test_source_balanced_weights(self):
        src = np.array(["a"] * 10 + ["b"] * 90)
        w = combine_data.source_balanced_weights(src)
        self.assertAlmostEqual(w[src == "a"].sum(), w[src == "b"].sum())
        self.assertEqual(len(set(w[src == "b"])), 1)  # natural label rate inside a source


if __name__ == "__main__":
    unittest.main()
