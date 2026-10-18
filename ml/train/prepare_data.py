"""Turn the committed manifest plus raw images into training arrays (story E2-01).

For every manifest row this checks the raw file's SHA-256 against the manifest before
using it. A missing or changed file stops the run: the manifest is the provenance record
(Section B4) and training must not see bytes it does not describe. Images are then
letterboxed to the model input size once (preprocess_spec.json) and saved per split.

Output in <out>: train.npz, val.npz, test.npz and prepare_report.json.
The test split is written but only loaded by evaluation of a frozen model (ML-DATA-04).

Usage:
    python3 ml/train/prepare_data.py --raw ml/data/raw/shenzhen \
        --manifest ml/manifests/shenzhen_v1/manifest.csv --out ml/data/processed/shenzhen_v1_320
"""

import argparse
import hashlib
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from preprocess import letterbox, load_spec  # noqa: E402

SPLITS = ("train", "val", "test")


class ProvenanceError(Exception):
    """A raw file is missing or does not match the manifest."""


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def dataset_version_hash(manifest):
    """Same formula as ml/pipeline/build_dataset.py, so the two can be compared."""
    m = manifest.sort_values("file")
    text = "\n".join(m["file"] + ":" + m["sha256"] + ":" + m["split"])
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _process(args):
    path, expected_sha, spec = args
    if not path.exists():
        return ("missing", path.name, None)
    actual = sha256_file(path)
    if actual != expected_sha:
        return ("changed", path.name, None)
    with Image.open(path) as im:
        return ("ok", path.name, letterbox(im, spec))


def prepare(raw, manifest_path, out, workers=4):
    spec = load_spec()
    manifest = pd.read_csv(manifest_path, dtype={"patient_id": str, "group_id": str})
    img_dir = Path(raw) / "CXR_png"
    jobs = [(img_dir / f, s, spec) for f, s in zip(manifest["file"], manifest["sha256"])]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(_process, jobs, chunksize=8))
    bad = [(status, name) for status, name, _ in results if status != "ok"]
    if bad:
        raise ProvenanceError(f"{len(bad)} raw files do not match the manifest, first: {bad[:5]}")
    arrays = {name: arr for _, name, arr in results}

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    report = {
        "dataset_version_hash": dataset_version_hash(manifest),
        "manifest": str(manifest_path),
        "preprocess_spec": spec["version"],
        "input_size": spec["input_size"],
        "splits": {},
    }
    for split in SPLITS:
        rows = manifest[manifest["split"] == split].sort_values("file")
        path = out / f"{split}.npz"
        np.savez_compressed(
            path,
            x=np.stack([arrays[f] for f in rows["file"]]),
            y=rows["label"].to_numpy(np.int64),
            files=rows["file"].to_numpy(str),
            # image metadata, used only by the shortcut baseline (rung 0)
            meta=rows[["width", "height", "bytes"]].to_numpy(np.float64),
        )
        report["splits"][split] = {
            "n": int(len(rows)),
            "tb": int(rows["label"].sum()),
            "npz_sha256": sha256_file(path),
        }
    (out / "prepare_report.json").write_text(json.dumps(report, indent=2))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build training arrays from the manifest.")
    ap.add_argument("--raw", default="ml/data/raw/shenzhen")
    ap.add_argument("--manifest", default="ml/manifests/shenzhen_v1/manifest.csv")
    ap.add_argument("--out", default="ml/data/processed/shenzhen_v1_320")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args(argv)
    try:
        report = prepare(a.raw, a.manifest, a.out, a.workers)
    except ProvenanceError as e:
        print(f"HARD FAIL: {e}", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
