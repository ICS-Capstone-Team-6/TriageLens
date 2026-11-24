"""Combine prepared training sources (Shenzhen, TBX11K) into one data folder (story E1-03).

Each source is first prepared on its own by prepare_data.py, which checks every raw file
against that source's manifest. This script only joins the arrays split by split:
train with train, val with val, test with test. Nothing moves between splits, so each
source's split rules (patient-level for Shenzhen, ADR-23 for TBX11K) still hold. The test
split stays locked (ML-DATA-04): data.load_split refuses it as before.

Every image keeps its source in a 'source' array, and its file becomes '<source>/<file>'.
Training uses the source to score validation per source and to pick the checkpoint on the
mean of the per-source AUROCs (train.py). Pooled AUROC would reward a model that only
learned which source an image came from: TB is about 50% of Shenzhen and 10% of TBX11K.

Output in <out>: train.npz, val.npz, test.npz and prepare_report.json, the same layout as
prepare_data.py, so train.py reads it unchanged.

Usage (from the repo root):
    python3 ml/train/combine_data.py --out ml/data/processed/cxr_combined_v1_cxr-pre-2 \
        shenzhen=ml/data/processed/shenzhen_v2_cxr-pre-2 tbx11k=ml/data/processed/tbx11k_v1_cxr-pre-2
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_data import SPLITS, sha256_file  # noqa: E402

NAME_RE = re.compile(r"^[a-z0-9_]+$")


def combined_version_hash(components):
    """One hash for the combination, from each source's name and dataset version hash."""
    text = "\n".join(f"{name}:{h}" for name, h in sorted(components.items()))
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def per_source_auroc(y, scores, sources, auroc):
    """{source: AUROC} for every source with both classes present."""
    out = {}
    for s in sorted(set(sources)):
        m = np.asarray(sources) == s
        if len(set(np.asarray(y)[m])) == 2:
            out[s] = auroc(np.asarray(y)[m], np.asarray(scores)[m])
    return out


def selection_auroc(y, scores, sources, auroc):
    """The checkpoint-selection score: plain AUROC for one source, else the mean of the
    per-source AUROCs, so a source shortcut cannot raise it."""
    if sources is None or len(set(sources)) < 2:
        return auroc(y, scores)
    per = per_source_auroc(y, scores, sources, auroc)
    return float(np.mean(list(per.values())))


def source_balanced_weights(sources):
    """Sampling weight per image so every source gives the same expected share of each
    epoch. Within a source, labels keep their natural rate."""
    sources = np.asarray(sources)
    names, counts = np.unique(sources, return_counts=True)
    w = {n: 1.0 / c for n, c in zip(names, counts)}
    return np.array([w[s] for s in sources], dtype=np.float64)


def combine(sources, out):
    """sources: {name: prepared folder}. Returns the combined prepare report."""
    if len(sources) < 2:
        raise ValueError("combine needs at least two sources")
    reports = {}
    for name, d in sources.items():
        if not NAME_RE.match(name):
            raise ValueError(f"source name {name!r}: use lower-case letters, digits and _")
        reports[name] = json.loads((Path(d) / "prepare_report.json").read_text())
    specs = {(r["preprocess_spec"], r["input_size"]) for r in reports.values()}
    if len(specs) != 1:
        raise ValueError(f"sources use different preprocessing: {sorted(specs)}")
    spec, size = specs.pop()

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    components = {n: r["dataset_version_hash"] for n, r in reports.items()}
    report = {
        "dataset_version_hash": combined_version_hash(components),
        "components": {n: {"dataset_version_hash": r["dataset_version_hash"], "manifest": r["manifest"],
                           "prepared": str(sources[n])} for n, r in reports.items()},
        "preprocess_spec": spec,
        "input_size": size,
        "splits": {},
    }
    for split in SPLITS:
        parts = {}
        for name, d in sorted(sources.items()):
            with np.load(Path(d) / f"{split}.npz") as z:
                parts[name] = {k: z[k] for k in z.files}
        x = np.concatenate([p["x"] for p in parts.values()])
        y = np.concatenate([p["y"] for p in parts.values()])
        files = np.concatenate([np.char.add(f"{n}/", p["files"].astype(str)) for n, p in parts.items()])
        src = np.concatenate([np.full(len(p["y"]), n) for n, p in parts.items()])
        meta = np.concatenate([p["meta"] for p in parts.values()])
        path = out / f"{split}.npz"
        np.savez_compressed(path, x=x, y=y, files=files, meta=meta, source=src)
        report["splits"][split] = {
            "n": int(len(y)), "tb": int(y.sum()), "npz_sha256": sha256_file(path),
            "by_source": {n: {"n": int(len(p["y"])), "tb": int(p["y"].sum())} for n, p in parts.items()},
        }
    (out / "prepare_report.json").write_text(json.dumps(report, indent=2))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description="Combine prepared training sources.")
    ap.add_argument("--out", required=True)
    ap.add_argument("sources", nargs="+", help="name=prepared_folder, at least two")
    a = ap.parse_args(argv)
    try:
        sources = dict(s.split("=", 1) for s in a.sources)
    except ValueError:
        ap.error("each source must look like name=folder")
    print(json.dumps(combine(sources, a.out), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
