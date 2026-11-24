"""Build the manifests for the India TB sets DA and DB, two locked external test sets.

Story E11-01. Rules: TRD 9.2 (ML-DATA-01 to 07, ML-DATA-04 locked external sets),
Team Rules 7 and 8. Reuses the Shenzhen and TBX11K pipeline helpers without changing them.

Source: Chauhan, Chauhan and Rout, PLoS One 2014 (National Institute of TB and Respiratory
Diseases, New Delhi), from the Kaggle copy vbookshelf/da-and-db-tb-chest-x-ray-datasets
(version 1), which matches the authors' SourceForge folders file for file (278 images).
See ml/manifests/india_tb_v1/DATA_CARD.md.

What the data forces (all decisions recorded in the data card):
- Labels come from the file name: 'p' = TB, 'n' = normal (the authors' label_information.txt).
  Labels are the consensus of two chest radiologists, not lab tests.
- DA and DB are scored as two separate external sets (different X-ray machines). Each kept
  record has split 'external', so data.load_split keeps it locked.
- DB is 16-bit DICOM with stripped headers. Each file is converted once to an 8-bit PNG:
  MONOCHROME1 is inverted, then the 0.5th to 99.5th percentile of that image is stretched to
  0-255, as a viewer does when a file has no display window. Fixed before any scoring and
  never tuned on labels. DA JPEGs are copied byte for byte.
- No age, sex or patient ID exists in either set. The age-15 check (TRD 9.1) cannot run;
  records are accepted and the gap is recorded (team decision, 24 Nov 2026, as ADR-23).
- Images matching Shenzhen, Montgomery or TBX11K (SHA-256 or dHash) are quarantined, and so
  is any image found in both DA and DB: a locked set must be new to the model and unique.
- Found counts must match the authors' folders, or the run stops.

Outputs
- <out>/da/ and <out>/db/: manifest.csv, quarantine.csv, near_duplicates.csv, run_report.json
  (committed): file names, labels, hashes and counts only.
- <stage>/images/{da,db}/ (git-ignored): the files the model reads; prepare_data.py takes them
  with --raw <stage> --img-subdir images --splits external.

Usage (from the repo root):
    python3 ml/pipeline/build_india.py
"""

import argparse
import datetime
import hashlib
import json
import platform
import re
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import PIL
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dataset import HASH_SIZE, MIN_SIDE, HardFail, code_commit, dhash, sha256_file  # noqa: E402
from build_tbx11k import cross_matches, near_pairs, union_groups  # noqa: E402

PIPELINE_VERSION = "0.1.0"
DATASET = "India TB sets DA and DB (Chauhan et al. 2014), Kaggle copy vbookshelf v1"
NAME_RE = re.compile(r"^(da|db)_(train|test)_([np])[xd]?(\d+)\.(jpg|dcm)$")
SETS = ("da", "db")
# The authors' SourceForge folders (the paper reports 150 for DB; 28 DB TB files are missing
# from the published training folder, so this is what exists).
EXPECTED = {"da": {"images": 156, "1": 78, "0": 78}, "db": {"images": 122, "1": 47, "0": 75}}
WINDOW_PCT = (0.5, 99.5)


# ---------- small, testable helpers ----------

def parse_name(name):
    """Return (set, source_split, label) or None if the name breaks the schema."""
    m = NAME_RE.match(name)
    if not m:
        return None
    return m.group(1), m.group(2), 1 if m.group(3) == "p" else 0


def dicom_to_u8(pixels, photometric, pct=WINDOW_PCT):
    """16-bit DICOM pixels -> 8-bit, display-ready (see module notes). Deterministic."""
    a = np.asarray(pixels, dtype=np.float64)
    if photometric == "MONOCHROME1":  # high values are dark: flip so bone is bright
        a = a.max() - a
    lo, hi = np.percentile(a, pct)
    if hi <= lo:
        raise ValueError("flat image: nothing to display")
    return (np.clip((a - lo) / (hi - lo), 0, 1) * 255 + 0.5).astype(np.uint8)


def stage_file(src, dst):
    """Copy a JPEG or convert a DICOM to PNG at dst. Returns 'copied' or 'dicom_to_png'."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix == ".jpg":
        shutil.copyfile(src, dst)
        return "copied"
    import pydicom  # only needed for DB

    ds = pydicom.dcmread(src)
    Image.fromarray(dicom_to_u8(ds.pixel_array, str(ds.get("PhotometricInterpretation", "")))).save(dst)
    return "dicom_to_png"


def find_images(raw):
    """The 'images' folder holding da/ and db/: raw/images or anywhere below raw."""
    for cand in [raw / "images", *sorted(raw.rglob("images"))]:
        if cand.is_dir() and all((cand / s).is_dir() for s in SETS):
            return cand
    raise HardFail(f"no images/ folder with da/ and db/ found under {raw}")


def load_other(manifest):
    m = pd.read_csv(manifest, dtype=str)
    return set(m["sha256"]), [int(h, 16) for h in m["dhash"]]


# ---------- pipeline ----------

def run(raw, out, stage, other_manifests, expected=EXPECTED):
    images = find_images(raw)
    quarantine = {s: [] for s in SETS}

    def q(rec, stage_name, check, reason):
        quarantine[rec["set"]].append({"file": rec.get("file"), "label": rec.get("label"), "stage": stage_name,
                                       "check": check, "reason": reason})

    # Stage 1: names and counts against the authors' folders
    found = {s: {"images": 0, "1": 0, "0": 0} for s in SETS}
    entries = []
    for s in SETS:
        for p in sorted(f for f in (images / s).iterdir() if f.is_file() and not f.name.startswith(".")):
            parsed = parse_name(p.name)
            found[s]["images"] += 1
            if not parsed or parsed[0] != s:
                quarantine[s].append({"file": f"{s}/{p.name}", "label": None, "stage": "ingest", "check": "filename_schema",
                                      "reason": "name does not match <set>_<train|test>_<p|n>...<number>"})
                continue
            found[s][str(parsed[2])] += 1
            entries.append((p, parsed))
    if found != expected:
        raise HardFail(f"counts differ from the authors' folders: found {found}, expected {expected}")

    # Stage 2: stage (copy or convert), then record checks on the staged file
    stage_img = stage / "images"
    cache_path = stage / "stage_cache.json"
    try:
        cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    except ValueError:
        cache = {}
    recs = []
    for p, (s, split, label) in entries:
        rel = f"{s}/{p.stem}.{'jpg' if p.suffix == '.jpg' else 'png'}"
        rec = {"set": s, "file": rel, "source_file": p.name, "source_split": split, "label": label,
               "patient_id": p.stem}
        src_sha = sha256_file(p)
        dst = stage_img / rel
        key = f"{p.name}:{src_sha}:pil{PIL.__version__}:w{WINDOW_PCT}"
        # Reuse only a successful entry whose staged file is still there, unchanged. Failures
        # are never reused: the cause (for example pydicom not yet installed) may be fixed.
        hit = cache.get(key)
        if hit is not None and ("error" in hit or not dst.exists() or sha256_file(dst) != hit.get("sha256")):
            hit = None
        if hit is None:
            try:
                how = stage_file(p, dst)
                with Image.open(dst) as im:
                    im.verify()
                with Image.open(dst) as im:
                    im.load()
                    hit = {"how": how, "width": im.width, "height": im.height, "mode": im.mode,
                           "dhash": dhash(im), "sha256": sha256_file(dst), "bytes": dst.stat().st_size}
            except Exception as e:  # any decode or conversion failure quarantines the file
                hit = {"error": type(e).__name__}
            cache[key] = hit
        if "error" in hit:
            q(rec, "ingest", "decodable", f"cannot read or convert ({hit['error']})")
            continue
        rec.update(hit, source_sha256=src_sha)
        if min(rec["width"], rec["height"]) < MIN_SIDE:
            q(rec, "ingest", "min_resolution", f"smallest side below the {MIN_SIDE} px quality floor")
            continue
        recs.append(rec)
    stage.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache))
    if not recs:
        raise HardFail("no image passed the ingest checks")
    df = pd.DataFrame(recs).reset_index(drop=True)

    # Stage 3: overlap with training sources and the other locked set
    overlap = {}
    for name, manifest in other_manifests.items():
        shas, hashes = load_other(manifest)
        near = cross_matches(df["dhash"].tolist(), hashes)
        for i, r in df.iterrows():
            if r["file"] in overlap:
                continue
            if r["sha256"] in shas:
                overlap[r["file"]] = (name, f"byte-identical to a {name} image")
            elif near[i] is not None:
                overlap[r["file"]] = (name, f"within {near[i]} dHash bits of a {name} image")
    # an image in both locked sets: quarantine every copy, in both sets
    for a, b in (("da", "db"), ("db", "da")):
        mine, theirs = df[df["set"] == a], df[df["set"] == b]
        for f, d in zip(mine["file"], cross_matches(mine["dhash"].tolist(), theirs["dhash"].tolist())):
            if d is not None:
                overlap.setdefault(f, (b.upper(), f"within {d} dHash bits of a {b.upper()} image"))
    hit = df["file"].isin(overlap)
    for _, r in df[hit].iterrows():
        q(r, "dedup", "other_source_overlap", overlap[r["file"]][1])
    df = df[~hit].reset_index(drop=True)

    # Stages 4 to 6, per set: duplicates, policy, batch checks, outputs
    reports = {}
    for s in SETS:
        d = df[df["set"] == s].reset_index(drop=True)
        pairs = near_pairs(d["dhash"].tolist())
        labels = d["label"].to_numpy()
        clash = sorted({k for i, j, _ in pairs if labels[i] != labels[j] for k in (i, j)})
        for i in clash:
            q(d.loc[i], "dedup", "duplicate_label_conflict", "an identical or near-identical image has the other label")
        d = d.drop(index=clash).reset_index(drop=True)
        dup = d.duplicated("sha256", keep="first")
        for _, r in d[dup].iterrows():
            q(r, "dedup", "exact_duplicate", "byte-identical to an earlier file")
        d = d[~dup].reset_index(drop=True)
        pairs = near_pairs(d["dhash"].tolist())
        ids = d["patient_id"].tolist()
        d["group_id"] = union_groups(ids, pairs)
        d["split"] = "external"
        # Stage 5: policy. No age exists; accepted and recorded (see module notes).

        qdf = pd.DataFrame(quarantine[s], columns=["file", "label", "stage", "check", "reason"])
        checks = [
            {"check": "source_matches_author_counts", "passed": found[s] == expected[s],
             "detail": f"found {found[s]}, authors' folders {expected[s]}"},
            {"check": "no_overlap_with_training_sources_or_other_set",
             "passed": not d["file"].isin(overlap).any(),
             "detail": f"{int(qdf['check'].eq('other_source_overlap').sum())} image(s) quarantined for overlap"},
            {"check": "both_classes_present", "passed": d["label"].nunique() == 2,
             "detail": f"label counts {d['label'].value_counts().to_dict()}"},
        ]
        o = out / s
        o.mkdir(parents=True, exist_ok=True)
        if not all(c["passed"] for c in checks):
            (o / "batch_checks_failed.json").write_text(json.dumps(checks, indent=2))
            raise HardFail(f"{s}: batch checks failed, see batch_checks_failed.json")
        (o / "batch_checks_failed.json").unlink(missing_ok=True)
        d = d.sort_values("file")
        d["dhash"] = d["dhash"].map(lambda h: f"{h:0{HASH_SIZE * HASH_SIZE // 4}x}")
        cols = ["file", "patient_id", "group_id", "label", "split", "width", "height", "bytes", "sha256", "dhash",
                "source_file", "source_sha256", "source_split", "how"]
        d[cols].to_csv(o / "manifest.csv", index=False)
        qdf.to_csv(o / "quarantine.csv", index=False)
        pd.DataFrame([(ids[i], ids[j], dist) for i, j, dist in pairs],
                     columns=["patient_a", "patient_b", "hamming_bits"]).to_csv(o / "near_duplicates.csv", index=False)
        version = hashlib.sha256("\n".join(d["file"] + ":" + d["sha256"] + ":" + d["split"]).encode()).hexdigest()[:16]
        report = {
            "dataset": f"{DATASET}: {s.upper()}",
            "dataset_version_hash": version,
            "pipeline_version": PIPELINE_VERSION,
            "role": "locked external test (ML-DATA-04)",
            "run_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
            "pillow": PIL.__version__, "code_commit": code_commit(),
            "staging": {"dicom_window_percentiles": list(WINDOW_PCT), "how": d["how"].value_counts().to_dict()},
            "images_found": found[s]["images"],
            "records_kept": int(len(d)),
            "records_quarantined": int(len(qdf)),
            "quarantine_by_check": qdf["check"].value_counts().to_dict(),
            "label_counts": {str(k): int(v) for k, v in d["label"].value_counts().items()},
            "source_split_counts": {k: {str(lab): int(n) for lab, n in g["label"].value_counts().items()}
                                    for k, g in d.groupby("source_split")},
            "size_counts": {f"{w}x{h}": int(n) for (w, h), n in d.groupby(["width", "height"]).size().items()},
            "near_duplicate_pairs": len(pairs),
            "age_check": "not run: no age metadata; accepted and recorded (TRD 9.1 gap)",
            "batch_checks": checks,
        }
        (o / "run_report.json").write_text(json.dumps(report, indent=2, default=str))
        reports[s] = report
    return reports


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", default="ml/data/raw/india_tb")
    ap.add_argument("--out", default="ml/manifests/india_tb_v1")
    ap.add_argument("--stage", default="ml/data/interim/india_tb_v1")
    ap.add_argument("--shenzhen-manifest", default="ml/manifests/shenzhen_v2/manifest.csv")
    ap.add_argument("--montgomery-manifest", default="ml/manifests/montgomery_v1/manifest.csv")
    ap.add_argument("--tbx11k-manifest", default="ml/manifests/tbx11k_v1/manifest.csv")
    a = ap.parse_args(argv)
    others = {"Shenzhen": Path(a.shenzhen_manifest), "Montgomery": Path(a.montgomery_manifest),
              "TBX11K": Path(a.tbx11k_manifest)}
    try:
        reports = run(Path(a.raw), Path(a.out), Path(a.stage), others)
    except HardFail as e:
        print(f"HARD FAIL: {e}", file=sys.stderr)
        return 1
    keys = ["dataset_version_hash", "images_found", "records_kept", "records_quarantined", "quarantine_by_check",
            "label_counts", "size_counts", "near_duplicate_pairs"]
    print(json.dumps({s: {k: r[k] for k in keys} for s, r in reports.items()}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
