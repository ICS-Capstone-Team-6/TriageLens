"""Build a validated, versioned, patient-level split of the Shenzhen TB chest X-ray set.

Story E1-03. Rules: TRD 9.2 (ML-DATA-01 to 07), Team Rules 7 and 8.

Stages: ingest and record checks, label checks, duplicate checks, intended-use policy,
patient-level split, batch checks, outputs. No record is dropped silently: every
removed record is written to quarantine.csv with the stage and check that removed it.

Outputs
- <out>/manifest.csv, quarantine.csv, near_duplicates.csv, run_report.json (committed):
  IDs, labels, splits, hashes and aggregate counts only.
- <private>/metadata_full.csv (git-ignored under ml/data/): sex, age and reading text.

Usage (from the repo root):
    python3 ml/pipeline/build_dataset.py
"""

import argparse
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

PIPELINE_VERSION = "0.1.0"
SEED = 591
SPLIT = {"train": 0.70, "val": 0.15, "test": 0.15}
MIN_SIDE = 512  # quality floor, not the model size: the model input is 320 px (TRD 10.6),
                # and 512 leaves room to crop to the lungs before resizing
MIN_AGE = 15  # TRD 9.1: chest X-ray tasks are for people aged 15 and over
HASH_SIZE = 16  # 16x16 dHash = 256 bits; 8x8 was too coarse for chest X-rays (see README)
NEAR_DUP_BITS = 12  # Hamming distance of 12 or less out of 256 bits; chosen from the data
MAX_MISSING_READING = 0.05  # more than this means the source changed: stop
MAX_PREVALENCE_GAP = 0.05  # TB rate in each split within 5 points of overall
MIN_RECORDS = 300
NAME_RE = re.compile(r"^CHNCXR_(\d{4})_([01])\.png$")


class HardFail(Exception):
    """A check that stops the whole run. No manifest is written."""


# ---------- small, testable helpers ----------

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def dhash(img, size=HASH_SIZE):
    """Difference hash (size*size bits): survives resizing and small intensity changes."""
    g = img.convert("L").resize((size + 1, size), Image.LANCZOS)
    a = np.asarray(g, dtype=np.int16)
    bits = (a[:, 1:] > a[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def hamming(a, b):
    return bin(a ^ b).count("1")


def parse_name(name):
    """Return (patient_id, label) or None if the name breaks the schema."""
    m = NAME_RE.match(name)
    return (m.group(1), int(m.group(2))) if m else None


def parse_reading(text):
    """Clinical reading: first line has sex and age, the rest is the finding."""
    lines = [ln.strip() for ln in text.replace("\r", "").split("\n") if ln.strip()]
    head = lines[0].lower() if lines else ""
    # real readings include "femal" and "male45yrs", so no word boundaries here
    m = re.search(r"(female|femal|male)", head)
    sex = {"femal": "female"}.get(m.group(1), m.group(1)) if m else None
    age = None
    m = re.search(r"(\d+)\s*(yrs?|years?|y)\b", head)
    if m:
        age = int(m.group(1))
    elif re.search(r"\d+\s*(months?|mos?|days?)", head):
        age = 0
    finding = " ".join(lines[1:]).strip()
    return sex, age, finding


def reading_says_normal(finding):
    f = (finding or "").lower().strip(" .")
    return f.startswith("normal")


def reading_mentions_tb(finding):
    f = (finding or "").lower()
    return bool(re.search(r"tb|tubercul", f))


def label_conflicts(label, finding):
    """True when the file label and the written reading disagree.

    The source label 1 means "abnormal lung", not TB. For the TB task a label 1
    must have a reading that names TB, or the record goes to review.
    """
    if label == 0:
        return not reading_says_normal(finding)
    return reading_says_normal(finding) or not reading_mentions_tb(finding)


def near_duplicate_groups(ids, hashes, max_bits=NEAR_DUP_BITS):
    """Union-find over near-identical images, so a group never straddles splits."""
    parent = list(range(len(ids)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    pairs = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            d = hamming(hashes[i], hashes[j])
            if d <= max_bits:
                pairs.append((ids[i], ids[j], d))
                parent[find(i)] = find(j)
    return [ids[find(i)] for i in range(len(ids))], pairs


def assign_splits(groups, seed=SEED, fractions=SPLIT):
    """Stratified by label, assigned per group (patient), deterministic for a seed.

    groups: DataFrame with columns group_id, label. Returns {group_id: split}.
    """
    rng = np.random.default_rng(seed)
    out = {}
    for _, g in groups.sort_values("group_id").groupby("label"):
        gids = g["group_id"].to_numpy().copy()
        rng.shuffle(gids)
        n = len(gids)
        n_tr = round(n * fractions["train"])
        n_va = round(n * fractions["val"])
        for gid in gids[:n_tr]:
            out[gid] = "train"
        for gid in gids[n_tr:n_tr + n_va]:
            out[gid] = "val"
        for gid in gids[n_tr + n_va:]:
            out[gid] = "test"
    return out


def batch_checks(df):
    """Checks on the whole split. Any failure is a hard stop."""
    checks = []

    def add(name, ok, detail):
        checks.append({"check": name, "passed": bool(ok), "detail": detail})

    add("no_patient_group_across_splits", df.groupby("group_id")["split"].nunique().max() == 1,
        "each patient or near-duplicate group sits in one split")
    add("no_identical_image_across_splits", df.groupby("sha256")["split"].nunique().max() == 1,
        "each byte-identical image sits in one split")
    overall = df["label"].mean()
    for s in SPLIT:
        rate = df.loc[df["split"] == s, "label"].mean()
        add(f"tb_rate_{s}", abs(rate - overall) <= MAX_PREVALENCE_GAP,
            f"{rate:.3f} vs overall {overall:.3f}")
    add("min_records", len(df) >= MIN_RECORDS, f"{len(df)} records kept, need {MIN_RECORDS}")
    return checks


# ---------- pipeline ----------

def run(raw, out, private):
    img_dir, rd_dir = raw / "CXR_png", raw / "ClinicalReadings"
    quarantine = []

    def q(rec, stage, check, reason):
        quarantine.append({"file": rec.get("file"), "patient_id": rec.get("patient_id"),
                           "label": rec.get("label"), "stage": stage, "check": check, "reason": reason})

    # Stage 1: ingest and record-level checks
    if not img_dir.is_dir():
        raise HardFail(f"image folder not found: {img_dir}")
    files = sorted(p for p in img_dir.iterdir() if p.is_file() and not p.name.startswith("."))
    if not files:
        raise HardFail("no images found")
    # Ingest cache: decoding about 660 3K images takes minutes, so per-file results are
    # cached by (name, size, mtime). A changed file is re-read; the cache never feeds a decision
    # about a file it does not match.
    private.mkdir(parents=True, exist_ok=True)
    cache_path = private / "ingest_cache.json"
    try:
        cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    except ValueError:
        cache = {}
    new_entries = 0
    recs = []
    for p in files:
        rec = {"file": p.name}
        parsed = parse_name(p.name)
        if not parsed:
            q(rec, "ingest", "filename_schema", "name does not match CHNCXR_####_[01].png")
            continue
        rec["patient_id"], rec["label"] = parsed
        st = p.stat()
        key = f"{p.name}:{st.st_size}:{st.st_mtime_ns}:h{HASH_SIZE}"
        hit = cache.get(key)
        if hit is None:
            try:
                with Image.open(p) as im:
                    im.verify()
                with Image.open(p) as im:
                    im.load()
                    hit = {"width": im.width, "height": im.height, "mode": im.mode,
                           "dhash": dhash(im), "sha256": sha256_file(p), "bytes": st.st_size}
            except Exception as e:  # any decode failure quarantines the file
                hit = {"error": type(e).__name__}
            cache[key] = hit
            new_entries += 1
            if new_entries % 50 == 0:
                cache_path.write_text(json.dumps(cache))
        if "error" in hit:
            q(rec, "ingest", "decodable", f"cannot decode image ({hit['error']})")
            continue
        rec.update(hit)
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
    if new_entries:
        cache_path.write_text(json.dumps(cache))
    if not recs:
        raise HardFail("no image passed the ingest checks")
    df = pd.DataFrame(recs)
    missing = 1 - df["has_reading"].mean()
    if missing > MAX_MISSING_READING:
        raise HardFail(f"{missing:.1%} of images have no clinical reading (limit {MAX_MISSING_READING:.0%})")

    # Stage 2: label checks (file label vs written reading)
    no_reading = ~df["has_reading"]
    for _, r in df[no_reading].iterrows():
        q(r, "label", "reading_present", "no clinical reading to confirm the label")
    df = df[~no_reading].copy()
    conflict = df.apply(lambda r: label_conflicts(r["label"], r["finding"]), axis=1)
    for _, r in df[conflict].iterrows():
        q(r, "label", "label_vs_reading", f"file label {r['label']} disagrees with the reading")
    df = df[~conflict].copy()

    # Stage 3: duplicates
    dup = df.duplicated("sha256", keep="first")
    for _, r in df[dup].iterrows():
        q(r, "dedup", "exact_duplicate", "byte-identical to an earlier file")
    df = df[~dup].copy()
    df["group_id"], near_pairs = near_duplicate_groups(df["patient_id"].tolist(), df["dhash"].tolist())

    # Stage 4: intended-use policy
    under = df["age"].notna() & (df["age"] < MIN_AGE)
    for _, r in df[under].iterrows():
        q(r, "policy", "intended_population", f"below minimum age {MIN_AGE} (TRD 9.1)")
    unknown = df["age"].isna()
    for _, r in df[unknown].iterrows():
        q(r, "policy", "age_unknown", "age not readable, cannot confirm intended population")
    df = df[~under & ~unknown].copy()

    # Stage 5: patient-level split
    groups = df.groupby("group_id")["label"].max().reset_index()
    df["split"] = df["group_id"].map(assign_splits(groups))

    # Stage 6: batch checks
    checks = batch_checks(df)
    out.mkdir(parents=True, exist_ok=True)
    if not all(c["passed"] for c in checks):
        (out / "batch_checks_failed.json").write_text(json.dumps(checks, indent=2))
        raise HardFail("batch checks failed, see batch_checks_failed.json")

    # Outputs (a failure file from an earlier run is stale once the checks pass)
    (out / "batch_checks_failed.json").unlink(missing_ok=True)
    df = df.sort_values("file")
    df["dhash"] = df["dhash"].map(lambda h: f"{h:0{HASH_SIZE * HASH_SIZE // 4}x}")
    public_cols = ["file", "patient_id", "group_id", "label", "split", "width", "height", "bytes", "sha256", "dhash"]
    df[public_cols].to_csv(out / "manifest.csv", index=False)
    qdf = pd.DataFrame(quarantine, columns=["file", "patient_id", "label", "stage", "check", "reason"])
    qdf.to_csv(out / "quarantine.csv", index=False)
    pd.DataFrame(near_pairs, columns=["patient_a", "patient_b", "hamming_bits"]).to_csv(
        out / "near_duplicates.csv", index=False)
    private.mkdir(parents=True, exist_ok=True)
    df[["file", "patient_id", "label", "split", "sex", "age", "finding"]].to_csv(
        private / "metadata_full.csv", index=False)

    version = hashlib.sha256("\n".join(df["file"] + ":" + df["sha256"] + ":" + df["split"]).encode()).hexdigest()[:16]
    age_bands = pd.cut(df["age"], [14, 24, 34, 44, 54, 64, 200],
                       labels=["15-24", "25-34", "35-44", "45-54", "55-64", "65+"])
    report = {
        "dataset": "NLM Shenzhen Hospital CXR Set",
        "dataset_version_hash": version,
        "pipeline_version": PIPELINE_VERSION,
        "seed": SEED,
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
        "near_duplicate_pairs": len(near_pairs),
        "missing_reading_rate": round(float(missing), 4),
        "label_counts": {str(k): int(v) for k, v in df["label"].value_counts().items()},
        "split_counts": {s: {str(k): int(v) for k, v in g["label"].value_counts().items()} for s, g in df.groupby("split")},
        "sex_counts": df["sex"].fillna("unknown").value_counts().to_dict(),
        "age_band_counts": age_bands.value_counts().sort_index().astype(int).to_dict(),
        "resolution_px": {"smallest_side_min": int(df[["width", "height"]].min(axis=1).min()),
                          "largest_side_max": int(df[["width", "height"]].max(axis=1).max())},
        "batch_checks": checks,
    }
    (out / "run_report.json").write_text(json.dumps(report, indent=2, default=str))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", default="ml/data/raw/shenzhen")
    ap.add_argument("--out", default="ml/manifests/shenzhen_v1")
    ap.add_argument("--private", default="ml/data/interim/shenzhen_v1")
    a = ap.parse_args(argv)
    try:
        report = run(Path(a.raw), Path(a.out), Path(a.private))
    except HardFail as e:
        print(f"HARD FAIL: {e}", file=sys.stderr)
        return 1
    keys = ["dataset_version_hash", "images_found", "records_kept", "records_quarantined",
            "quarantine_by_check", "near_duplicate_pairs", "label_counts", "split_counts"]
    print(json.dumps({k: report[k] for k in keys}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
