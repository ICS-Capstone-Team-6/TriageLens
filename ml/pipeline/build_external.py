"""Build the manifest for the Montgomery County TB set, a locked external test set.

Story E11-01. Rules: TRD 9.2 (ML-DATA-01 to 07, ML-DATA-04 locked external sets),
Team Rules 7 and 8. Reuses the Shenzhen pipeline's checks (build_dataset.py) without
changing it, so the Shenzhen dataset hash stays the same.

Differences from Shenzhen, all from the data (see DATA_CARD.md):
- No train/val/test split: every kept record has split "external". It is scored once per
  frozen model and never used for training, tuning or thresholds.
- Readings are three lines: "Patient's Sex: F", "Patient's Age: 040Y", the finding.
- Label 1 means TB manifestations (NLM), including inactive or healed TB. Many TB findings
  describe the lesion (granuloma, scars, infiltrate) without the word TB, so the label
  check is: label 0 must read normal, label 1 must not. Shenzhen also requires the word TB,
  because its label 1 means any abnormality.
- Some readings refer to another image of the same patient ("same as MCUCXR_0123"); those
  images share a patient group, as do near-duplicate images.
- Overlap with Shenzhen is checked by SHA-256 and dHash. An overlapping image is
  quarantined: it would not be external.
- montgomery_metadata.csv (Kaggle, third party) is compared with the NLM readings and the
  differences are counted; the NLM readings decide.

Outputs
- <out>/manifest.csv, quarantine.csv, near_duplicates.csv, run_report.json (committed):
  IDs, labels, hashes and counts only.
- <private>/metadata_full.csv, csv_differences.csv (git-ignored): sex, age, reading text.

Usage (from the repo root):
    python3 ml/pipeline/build_external.py
"""

import argparse
import csv
import datetime
import hashlib
import json
import platform
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dataset import (HASH_SIZE, MIN_AGE, MIN_SIDE, NEAR_DUP_BITS, HardFail,  # noqa: E402
                           dhash, hamming, near_duplicate_groups, reading_says_normal, sha256_file)

PIPELINE_VERSION = "0.1.0"
DATASET = "NLM Montgomery County CXR Set (images: Kaggle raddar copy; readings: NLM)"
NAME_RE = re.compile(r"^MCUCXR_(\d{4})_([01])\.png$")
REF_RE = re.compile(r"MCUCXR_(\d{4})", re.IGNORECASE)
EXPECTED = {"images": 138, "0": 80, "1": 58}  # NLM README
MAX_MISSING_READING = 0.0  # the download check already requires every reading
MIN_RECORDS = 100  # ML-EVAL-06: small sets give wide intervals; below this, stop and review


def parse_name(name):
    m = NAME_RE.match(name)
    return (m.group(1), int(m.group(2))) if m else None


def parse_reading(text):
    """Montgomery reading: sex line, age line, finding. Returns (sex, age, finding)."""
    lines = [ln.strip() for ln in text.replace("\r", "").split("\n") if ln.strip()]
    sex = age = None
    rest = []
    for ln in lines:
        m = re.match(r"patient'?s\s+sex\s*:\s*(\w+)", ln, re.IGNORECASE)
        if m:
            sex = {"f": "female", "m": "male"}.get(m.group(1).lower()[0], "other")
            continue
        m = re.match(r"patient'?s\s+age\s*:\s*(\d+)\s*([ymd])?", ln, re.IGNORECASE)
        if m:
            unit = (m.group(2) or "y").lower()
            age = int(m.group(1)) if unit == "y" else 0  # months or days: under one year
            continue
        rest.append(ln)
    return sex, age, " ".join(rest).strip()


def label_conflicts(label, finding):
    """Label 0 must read normal; label 1 must not (see module notes)."""
    normal = reading_says_normal(finding)
    return not normal if label == 0 else normal


def referenced_ids(finding, own_id):
    return sorted({m for m in REF_RE.findall(finding or "") if m != own_id})


def patient_groups(ids, hashes, findings):
    """One group per patient: near-duplicate images, joined with readings that name
    another image ("same as MCUCXR_0123"). Returns (group per id, near pairs, links)."""
    _, pairs = near_duplicate_groups(ids, hashes)
    parent = {i: i for i in ids}

    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    for a, b, _ in pairs:
        union(a, b)
    links = []
    for i, f in zip(ids, findings):
        for j in referenced_ids(f, i):
            if j in parent:
                links.append((i, j))
                union(i, j)
    return [find(i) for i in ids], pairs, links


def shenzhen_overlap(df, shenzhen_manifest, max_bits=NEAR_DUP_BITS):
    """Montgomery files that are byte-identical or near-identical to a Shenzhen image."""
    sz = pd.read_csv(shenzhen_manifest, dtype=str)
    sz_sha = set(sz["sha256"])
    sz_hash = [int(h, 16) for h in sz["dhash"]]
    hits = {}
    for _, r in df.iterrows():
        if r["sha256"] in sz_sha:
            hits[r["file"]] = "byte-identical to a Shenzhen image"
            continue
        best = min(hamming(r["dhash"], h) for h in sz_hash)
        if best <= max_bits:
            hits[r["file"]] = f"within {best} bits of a Shenzhen image"
    return hits


def compare_csv(df, csv_path):
    """Kaggle metadata vs NLM readings: one row per field that differs."""
    if not Path(csv_path).exists():
        return None
    rows = {r["study_id"].replace(".png", ""): r for r in csv.DictReader(open(csv_path))}
    diffs = []
    norm = lambda s: re.sub(r"\s+", " ", str(s or "")).strip().lower()  # noqa: E731
    for _, r in df.iterrows():
        c = rows.get(Path(r["file"]).stem)
        if c is None:
            diffs.append({"file": r["file"], "field": "row", "csv": "", "reading": "missing in csv"})
            continue
        csv_sex = {"f": "female", "m": "male"}.get(c["gender"].lower()[:1], "other")
        checks = [("sex", csv_sex, r["sex"]),
                  ("age", c["age"].strip().lstrip("0") or "0", str(r["age"])),
                  ("finding", norm(c["findings"]), norm(r["finding"]))]
        diffs += [{"file": r["file"], "field": f, "csv": a, "reading": b} for f, a, b in checks if a != b]
    return diffs


def run(raw, out, private, shenzhen_manifest):
    img_dir, rd_dir = raw / "images" / "images", raw / "ClinicalReadings"
    quarantine = []

    def q(rec, stage, check, reason):
        quarantine.append({"file": rec.get("file"), "patient_id": rec.get("patient_id"),
                           "label": rec.get("label"), "stage": stage, "check": check, "reason": reason})

    # Stage 1: ingest
    if not img_dir.is_dir():
        raise HardFail(f"image folder not found: {img_dir}")
    files = sorted(p for p in img_dir.iterdir() if p.is_file() and not p.name.startswith("."))
    recs = []
    for p in files:
        rec = {"file": p.name}
        parsed = parse_name(p.name)
        if not parsed:
            q(rec, "ingest", "filename_schema", "name does not match MCUCXR_####_[01].png")
            continue
        rec["patient_id"], rec["label"] = parsed
        try:
            with Image.open(p) as im:
                im.verify()
            with Image.open(p) as im:
                im.load()
                rec.update(width=im.width, height=im.height, dhash=dhash(im))
        except Exception as e:  # any decode failure quarantines the file
            q(rec, "ingest", "decodable", f"cannot decode image ({type(e).__name__})")
            continue
        rec.update(sha256=sha256_file(p), bytes=p.stat().st_size)
        if min(rec["width"], rec["height"]) < MIN_SIDE:
            q(rec, "ingest", "min_resolution", f"smallest side below the {MIN_SIDE} px quality floor")
            continue
        rp = rd_dir / (p.stem + ".txt")
        if rp.exists():
            rec["sex"], rec["age"], rec["finding"] = parse_reading(rp.read_text(errors="replace"))
            rec["has_reading"] = True
        else:
            rec.update(sex=None, age=None, finding=None, has_reading=False)
        recs.append(rec)
    if not recs:
        raise HardFail("no image passed the ingest checks")
    df = pd.DataFrame(recs)
    missing = 1 - df["has_reading"].mean()
    if missing > MAX_MISSING_READING:
        raise HardFail(f"{missing:.1%} of images have no NLM clinical reading: "
                       "add ml/data/raw/montgomery/ClinicalReadings (ml/pipeline/README.md)")

    # Stage 2: labels
    conflict = df.apply(lambda r: label_conflicts(r["label"], r["finding"]), axis=1)
    for _, r in df[conflict].iterrows():
        q(r, "label", "label_vs_reading", f"file label {r['label']} disagrees with the reading")
    df = df[~conflict].copy()

    # Stage 3: duplicates, patient groups, overlap with the training source
    dup = df.duplicated("sha256", keep="first")
    for _, r in df[dup].iterrows():
        q(r, "dedup", "exact_duplicate", "byte-identical to an earlier file")
    df = df[~dup].copy()
    df["group_id"], near_pairs, links = patient_groups(
        df["patient_id"].tolist(), df["dhash"].tolist(), df["finding"].tolist())
    overlap = shenzhen_overlap(df, shenzhen_manifest)
    hit = df["file"].isin(overlap)
    for _, r in df[hit].iterrows():
        q(r, "dedup", "training_source_overlap", overlap[r["file"]])
    df = df[~hit].copy()

    # Stage 4: intended-use policy
    under = df["age"].notna() & (df["age"] < MIN_AGE)
    for _, r in df[under].iterrows():
        q(r, "policy", "intended_population", f"below minimum age {MIN_AGE} (TRD 9.1)")
    unknown = df["age"].isna()
    for _, r in df[unknown].iterrows():
        q(r, "policy", "age_unknown", "age not readable, cannot confirm intended population")
    df = df[~under & ~unknown].copy()
    df["split"] = "external"

    # Stage 5: batch checks
    found = {"images": len(files), **{str(k): int(v) for k, v in
                                       pd.Series([parse_name(p.name)[1] for p in files
                                                  if parse_name(p.name)]).value_counts().items()}}
    checks = [
        {"check": "source_matches_nlm_counts", "passed": all(found.get(k) == v for k, v in EXPECTED.items()),
         "detail": f"found {found}, NLM lists {EXPECTED}"},
        {"check": "no_training_source_overlap", "passed": not df["file"].isin(overlap).any(),
         "detail": f"{len(overlap)} image(s) overlapped Shenzhen and were quarantined"},
        {"check": "min_records", "passed": len(df) >= MIN_RECORDS,
         "detail": f"{len(df)} records kept, need {MIN_RECORDS}"},
        {"check": "both_classes_present", "passed": df["label"].nunique() == 2,
         "detail": f"labels kept: {sorted(df['label'].unique().tolist())}"},
    ]
    out.mkdir(parents=True, exist_ok=True)
    if not all(c["passed"] for c in checks):
        (out / "batch_checks_failed.json").write_text(json.dumps(checks, indent=2))
        raise HardFail("batch checks failed, see batch_checks_failed.json")
    (out / "batch_checks_failed.json").unlink(missing_ok=True)

    # Outputs
    diffs = compare_csv(df, raw / "montgomery_metadata.csv")
    df = df.sort_values("file")
    df["dhash"] = df["dhash"].map(lambda h: f"{h:0{HASH_SIZE * HASH_SIZE // 4}x}")
    df["inactive_or_healed"] = df["finding"].str.contains(r"\b(?:inactive|healed|old|scars?|calcifi\w*)\b",
                                                          case=False, regex=True) & (df["label"] == 1)
    public_cols = ["file", "patient_id", "group_id", "label", "split", "width", "height", "bytes", "sha256", "dhash"]
    df[public_cols].to_csv(out / "manifest.csv", index=False)
    qdf = pd.DataFrame(quarantine, columns=["file", "patient_id", "label", "stage", "check", "reason"])
    qdf.to_csv(out / "quarantine.csv", index=False)
    pd.DataFrame(near_pairs, columns=["patient_a", "patient_b", "hamming_bits"]).to_csv(
        out / "near_duplicates.csv", index=False)
    private.mkdir(parents=True, exist_ok=True)
    df[["file", "patient_id", "group_id", "label", "sex", "age", "finding", "inactive_or_healed"]].to_csv(
        private / "metadata_full.csv", index=False)
    if diffs is not None:
        pd.DataFrame(diffs, columns=["file", "field", "csv", "reading"]).to_csv(
            private / "csv_differences.csv", index=False)

    version = hashlib.sha256("\n".join(df["file"] + ":" + df["sha256"] + ":" + df["split"]).encode()).hexdigest()[:16]
    source = json.loads((raw / "SOURCE.json").read_text()) if (raw / "SOURCE.json").exists() else {}
    age_bands = pd.cut(df["age"], [14, 24, 34, 44, 54, 64, 200],
                       labels=["15-24", "25-34", "35-44", "45-54", "55-64", "65+"])
    aspect = df["width"] / df["height"]
    report = {
        "dataset": DATASET,
        "dataset_version_hash": version,
        "pipeline_version": PIPELINE_VERSION,
        "role": "locked external test (ML-DATA-04)",
        "source_kaggle_version": source.get("version"),
        "run_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "pandas": pd.__version__,
        "images_found": len(files),
        "records_kept": int(len(df)),
        "records_quarantined": int(len(qdf)),
        "quarantine_by_check": qdf["check"].value_counts().to_dict(),
        "quarantine_by_check_and_label": {f"{c} (label {lab})": int(n) for (c, lab), n in
                                          qdf.groupby(["check", "label"], dropna=False).size().items()},
        "label_counts": {str(k): int(v) for k, v in df["label"].value_counts().items()},
        "tb_inactive_or_healed": int(df["inactive_or_healed"].sum()),
        "patient_groups": int(df["group_id"].nunique()),
        "images_in_multi_image_groups": int(df.groupby("group_id")["file"].transform("size").gt(1).sum()),
        "reading_links_to_other_images": len(links),
        "near_duplicate_pairs": len(near_pairs),
        "shenzhen_overlap": len(overlap),
        "csv_vs_readings_differences": (None if diffs is None else
                                        pd.Series([d["field"] for d in diffs], dtype=str).value_counts().to_dict()),
        "sex_counts": df["sex"].fillna("unknown").value_counts().to_dict(),
        "age_band_counts": age_bands.value_counts().sort_index().astype(int).to_dict(),
        "orientation_counts": {"portrait": int((aspect < 1).sum()), "landscape": int((aspect >= 1).sum())},
        "resolution_px": {"smallest_side_min": int(df[["width", "height"]].min(axis=1).min()),
                          "largest_side_max": int(df[["width", "height"]].max(axis=1).max())},
        "batch_checks": checks,
    }
    (out / "run_report.json").write_text(json.dumps(report, indent=2, default=str))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", default="ml/data/raw/montgomery")
    ap.add_argument("--out", default="ml/manifests/montgomery_v1")
    ap.add_argument("--private", default="ml/data/interim/montgomery_v1")
    ap.add_argument("--shenzhen-manifest", default="ml/manifests/shenzhen_v1/manifest.csv")
    a = ap.parse_args(argv)
    try:
        report = run(Path(a.raw), Path(a.out), Path(a.private), Path(a.shenzhen_manifest))
    except HardFail as e:
        print(f"HARD FAIL: {e}", file=sys.stderr)
        return 1
    keys = ["dataset_version_hash", "images_found", "records_kept", "records_quarantined",
            "quarantine_by_check_and_label", "label_counts", "tb_inactive_or_healed", "patient_groups",
            "images_in_multi_image_groups", "shenzhen_overlap", "csv_vs_readings_differences",
            "orientation_counts"]
    print(json.dumps({k: report[k] for k in keys}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
