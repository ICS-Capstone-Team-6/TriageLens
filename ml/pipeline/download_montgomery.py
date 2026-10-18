"""Download the Montgomery County TB chest X-ray set into ml/data/raw/montgomery/.

Montgomery is the locked external TB test set (TRD 9.2 dataset table, ML-DATA-04;
ADR-16 follow-ups). It is never used for training, tuning or thresholds.

Source: the Kaggle copy "raddar/tuberculosis-chest-xrays-montgomery", a third-party
re-upload of the NLM set (https://lhncbc.nlm.nih.gov/LHC-downloads/downloads.html).
Because it is not the original source, this script records exactly what was received in
SOURCE.json (handle, version, date, SHA-256 of every file) for the data card, and prints
the layout so it can be checked against the NLM description (138 images: 80 normal,
58 TB; file names MCUCXR_####_L.png with L the label; one clinical reading per image).

ml/data/ is git-ignored: the images stay on this machine and the Modal data volume only
(Team Rules 6 and 8; NLM terms: do not share outside the research group).

Usage, from the repo root:
    pip install kagglehub==1.0.2
    python3 ml/pipeline/download_montgomery.py
"""

import argparse
import collections
import datetime
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

HANDLE = "raddar/tuberculosis-chest-xrays-montgomery"
REPO = Path(__file__).resolve().parents[2]
DEST = REPO / "ml" / "data" / "raw" / "montgomery"
EXPECTED = {"images": 138, "normal": 80, "tb": 58}  # NLM README for the Montgomery set
NAME = re.compile(r"MCUCXR_(\d{4})_([01])\.png$", re.IGNORECASE)


def sha256(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def download(handle=HANDLE, version=None):
    """Download into kagglehub's cache; returns (cache path, version number)."""
    import kagglehub

    full = f"{handle}/versions/{version}" if version else handle
    path = Path(kagglehub.dataset_download(full))
    match = re.search(r"versions/(\d+)", str(path))
    return path, int(match.group(1)) if match else version


def layout(root):
    """What arrived: file types, images by label, clinical readings."""
    files = [p for p in Path(root).rglob("*") if p.is_file() and p.name != "SOURCE.json"]
    images = [p for p in files if NAME.search(p.name)]
    labels = collections.Counter(NAME.search(p.name).group(2) for p in images)
    image_stems = {p.stem.lower() for p in images}
    readings = [p for p in files if p.suffix.lower() == ".txt" and p.stem.lower() in image_stems]
    return {
        "files": len(files),
        "by_extension": dict(collections.Counter(p.suffix.lower() or "(none)" for p in files)),
        "folders": sorted({str(p.parent.relative_to(root)) for p in files}),
        "images_named_MCUCXR": len(images),
        "normal_0": labels.get("0", 0),
        "tb_1": labels.get("1", 0),
        "readings_matching_an_image": len(readings),
        "other_files": sorted(str(p.relative_to(root)) for p in files
                              if p not in images and p not in readings)[:20],
    }


def problems(summary):
    found = []
    if summary["images_named_MCUCXR"] != EXPECTED["images"]:
        found.append(f"{summary['images_named_MCUCXR']} MCUCXR images, NLM lists {EXPECTED['images']}")
    if (summary["normal_0"], summary["tb_1"]) != (EXPECTED["normal"], EXPECTED["tb"]):
        found.append(f"labels {summary['normal_0']} normal / {summary['tb_1']} TB, "
                     f"NLM lists {EXPECTED['normal']} / {EXPECTED['tb']}")
    if summary["readings_matching_an_image"] < summary["images_named_MCUCXR"]:
        found.append(f"only {summary['readings_matching_an_image']} clinical readings for "
                     f"{summary['images_named_MCUCXR']} images: age and the label check need them")
    return found


def main(argv=None):
    ap = argparse.ArgumentParser(description="Download the Montgomery set from Kaggle.")
    ap.add_argument("--version", type=int, help="Kaggle dataset version (default: latest)")
    ap.add_argument("--dest", type=Path, default=DEST)
    ap.add_argument("--force", action="store_true", help="replace an existing download")
    ap.add_argument("--keep-cache", action="store_true",
                    help="keep kagglehub's cached copy (default: delete it, so one copy exists)")
    a = ap.parse_args(argv)

    if a.dest.exists() and any(a.dest.iterdir()) and not a.force:
        print(f"{a.dest} is not empty. Use --force to replace it.")
        return 1
    cache, version = download(version=a.version)
    if a.dest.exists():
        shutil.rmtree(a.dest)
    shutil.copytree(cache, a.dest)
    if not a.keep_cache:
        shutil.rmtree(cache, ignore_errors=True)

    summary = layout(a.dest)
    record = {
        "source": f"https://www.kaggle.com/datasets/{HANDLE}",
        "handle": HANDLE, "version": version,
        "original_source": "NLM Montgomery County CXR Set",
        "downloaded_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "layout": summary,
        "sha256": {str(p.relative_to(a.dest)): sha256(p)
                   for p in sorted(a.dest.rglob("*")) if p.is_file() and p.name != "SOURCE.json"},
    }
    (a.dest / "SOURCE.json").write_text(json.dumps(record, indent=2))

    shown = a.dest.relative_to(REPO) if a.dest.is_relative_to(REPO) else a.dest
    print(f"Downloaded {HANDLE} version {version} to {shown}")
    print(json.dumps(summary, indent=2))
    issues = problems(summary)
    if issues:
        print("\nCHECK BEFORE USE (differs from the NLM description):")
        for i in issues:
            print(f"  - {i}")
        return 2
    print("\nMatches the NLM description. Next: the manifest and data card (ml/pipeline/README.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
