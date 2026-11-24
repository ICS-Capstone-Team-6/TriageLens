"""Build a validated, versioned DR dataset from APTOS 2019 plus an EyePACS subsample.

Story E3-01. Rules: TRD 9.2 (ML-DATA-01 to 07), 9.3 (retinal preprocessing), 10.6, Team Rules 7.

Stages: ingest and record checks, fundus check, duplicate checks, grouping (patient and
near-duplicate), seeded split stratified by grade, batch checks, outputs. No record is
dropped silently: every removed record is in quarantine.csv with its stage and check.

Labels: grade 0 to 4 (none, mild, moderate, severe, proliferative). Referable DR is grade 2
or higher (TRD glossary). Both sources come from diabetic screening programmes; neither has
age or sex, so the intended-population check is recorded as "not checkable".

Patients: EyePACS names are <patient>_<left|right>, so both eyes of one person share a split.
APTOS has one ID per image and no patient ID: each image is its own patient, and
near-identical images are grouped so a re-saved copy cannot cross splits (ADR-26, proposed).

Outputs
- <out>/manifest.csv, quarantine.csv, near_duplicates.csv, run_report.json (committed):
  IDs, grades, splits, hashes and counts only.
- <private>/images/<source>/<image_id>.png (git-ignored): fundus crops, squared, downsized
  to DOWNSIZED_SIDE px (ML-DATA-06). Training resizes these to 384 (TRD 10.6).

Usage (from the repo root; raw data git-ignored under ml/data/raw/):
    python3 ml/pipeline/build_dr.py
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
import PIL
from PIL import Image

from build_dataset import HardFail, assign_splits, code_commit, dhash, hamming, sha256_file

PIPELINE_VERSION = "0.1.0"
SEED = 591
SPLIT = {"train": 0.70, "val": 0.15, "test": 0.15}
REFERABLE_GRADE = 2  # moderate or worse (TRD glossary)
MIN_SIDE = 384  # the model input (TRD 10.6); smaller images would be upscaled
HASH_SIZE = 16
NEAR_DUP_BITS = 12  # provisional, copied from Shenzhen; re-check with nearest_distance in the report
BORDER_LEVEL = 10  # grey level that separates the black border from the fundus
MIN_FUNDUS_FRACTION = 0.20  # less fundus than this in the frame: blank, or not a fundus image
DOWNSIZED_SIDE = 512
EYEPACS_TARGET = 20000  # images, about (ML-DATA-06)
MAX_REFERABLE_GAP = 0.05
MIN_RECORDS = 1000
EYEPACS_RE = re.compile(r"^(\d+)_(left|right)$")
APTOS_RE = re.compile(r"^[0-9a-f]{12}$")


# ---------- sources ----------

def _read_labels(csv_path, id_col, grade_col):
    if not csv_path.exists():
        raise HardFail(f"labels file not found: {csv_path}")
    df = pd.read_csv(csv_path, dtype={id_col: str})
    missing = {id_col, grade_col} - set(df.columns)
    if missing:
        raise HardFail(f"{csv_path} has no column(s) {sorted(missing)}; the source format changed")
    return df


def read_aptos(raw):
    """APTOS 2019 train.csv (id_code, diagnosis) with train_images/<id_code>.png."""
    df = _read_labels(raw / "train.csv", "id_code", "diagnosis")
    return [{"source": "aptos", "image_id": r.id_code, "path": raw / "train_images" / f"{r.id_code}.png",
             "patient_id": f"aptos-{r.id_code}", "eye": None, "grade": r.diagnosis,
             "name_ok": bool(APTOS_RE.match(r.id_code))} for r in df.itertuples()]


def read_eyepacs(raw):
    """EyePACS (Kaggle DR 2015) trainLabels.csv (image, level) with train/<image>.jpeg."""
    df = _read_labels(raw / "trainLabels.csv", "image", "level")
    recs = []
    for r in df.itertuples():
        m = EYEPACS_RE.match(r.image)
        recs.append({"source": "eyepacs", "image_id": r.image, "path": raw / "train" / f"{r.image}.jpeg",
                     "patient_id": f"eyepacs-{m.group(1)}" if m else None,
                     "eye": m.group(2) if m else None, "grade": r.level, "name_ok": bool(m)})
    return recs


def subsample_patients(recs, target, seed=SEED):
    """Keep about `target` images by whole patients, stratified by each patient's worst grade.

    Deterministic for a seed. Both eyes of a patient are kept or dropped together, and the
    natural grade mix is kept (no oversampling here; training can weight classes).
    """
    if len(recs) <= target:
        return list(recs)
    by_patient = {}
    for r in recs:
        by_patient.setdefault(r["patient_id"], []).append(r)
    worst = pd.Series({p: max(x["grade"] for x in rs) for p, rs in by_patient.items()})
    rng = np.random.default_rng(seed)
    keep = []
    for _, pats in worst.sort_index().groupby(worst.sort_index()):
        ids = pats.index.to_numpy().copy()
        rng.shuffle(ids)
        keep.extend(ids[:round(len(ids) * target / len(recs))])
    return [r for p in sorted(keep) for r in by_patient[p]]


# ---------- image helpers ----------

def fundus_box(img, level=BORDER_LEVEL):
    """Bounding box (l, t, r, b) of the bright fundus disc and the share of the frame it fills."""
    a = np.asarray(img.convert("L"))
    mask = a > level
    rows, cols = np.flatnonzero(mask.any(1)), np.flatnonzero(mask.any(0))
    if not len(rows):
        return None, 0.0
    return (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1), float(mask.mean())


def crop_fundus(img, side=DOWNSIZED_SIDE, level=BORDER_LEVEL):
    """Crop the black border, pad to a square with black, resize (TRD 9.3 retinal step 1 and 2).

    Padding, not stretching: the fundus is a disc, and a stretched disc changes lesion shapes.
    Spec name `dr-pre-1`; the browser port must match it (TRD 9.3, parity test).
    """
    box, _ = fundus_box(img, level)
    if box is None:
        raise ValueError("no fundus found")
    c = img.convert("RGB").crop(box)
    n = max(c.size)
    sq = Image.new("RGB", (n, n))
    sq.paste(c, ((n - c.width) // 2, (n - c.height) // 2))
    return sq.resize((side, side), Image.LANCZOS)


def near_pairs(hashes, max_bits=NEAR_DUP_BITS, bits=HASH_SIZE * HASH_SIZE):
    """All pairs (i, j, distance) with Hamming distance <= max_bits, without comparing every pair.

    Pigeonhole: split the hash into max_bits + 1 bands. Two hashes that differ in at most
    max_bits bits leave at least one band identical, so bucketing by each band finds every
    such pair; candidates are then checked exactly. Same result as the all-pairs loop.
    """
    n_bands = max_bits + 1
    # Plain Python ints: shifting a 256-bit int by a numpy int64 overflows on numpy 2.
    edges = [int(e) for e in np.linspace(0, bits, n_bands + 1)]
    seen = set()
    for lo, hi in zip(edges[:-1], edges[1:]):
        buckets = {}
        mask = (1 << (hi - lo)) - 1
        for i, h in enumerate(hashes):
            buckets.setdefault((h >> lo) & mask, []).append(i)
        for idx in buckets.values():
            for a in range(len(idx)):
                for b in range(a + 1, len(idx)):
                    seen.add((idx[a], idx[b]))
    out = []
    for i, j in sorted(seen):
        d = hamming(hashes[i], hashes[j])
        if d <= max_bits:
            out.append((i, j, d))
    return out


def union_groups(patient_ids, pairs):
    parent = list(range(len(patient_ids)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    first = {}
    for i, p in enumerate(patient_ids):
        if p in first:
            parent[find(i)] = find(first[p])
        else:
            first[p] = i
    for i, j, _ in pairs:
        parent[find(i)] = find(j)
    return [patient_ids[find(i)] for i in range(len(patient_ids))]


def nearest_distance_summary(hashes, sample=500, seed=SEED):
    """Quantiles of each image's distance to its nearest other image (a sample), to set NEAR_DUP_BITS."""
    if len(hashes) < 2:
        return {}
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(hashes), size=min(sample, len(hashes)), replace=False)
    d = [min(hamming(hashes[i], h) for j, h in enumerate(hashes) if j != i) for i in idx]
    return {q: int(np.quantile(d, float(q))) for q in ("0.01", "0.05", "0.5")}


def batch_checks(df):
    checks = []

    def add(name, ok, detail):
        checks.append({"check": name, "passed": bool(ok), "detail": detail})

    for col, what in (("patient_id", "patient"), ("group_id", "patient or near-duplicate group"),
                      ("sha256", "byte-identical image")):
        add(f"no_{col}_across_splits", df.groupby(col)["split"].nunique().max() == 1,
            f"each {what} sits in one split")
    overall = df["referable"].mean()
    for s in SPLIT:
        rate = df.loc[df["split"] == s, "referable"].mean()
        add(f"referable_rate_{s}", abs(rate - overall) <= MAX_REFERABLE_GAP, f"{rate:.3f} vs overall {overall:.3f}")
    add("min_records", len(df) >= MIN_RECORDS, f"{len(df)} records kept, need {MIN_RECORDS}")
    return checks


# ---------- pipeline ----------

def run(aptos_raw, eyepacs_raw, out, private, eyepacs_target=EYEPACS_TARGET, write_copies=True):
    quarantine = []

    def q(rec, stage, check, reason):
        quarantine.append({"source": rec["source"], "image_id": rec["image_id"], "grade": rec["grade"],
                           "stage": stage, "check": check, "reason": reason})

    eyepacs_all = read_eyepacs(eyepacs_raw)
    recs = read_aptos(aptos_raw)
    for r in eyepacs_all:
        if not r["name_ok"]:
            q(r, "ingest", "name_schema", "name is not <patient>_<left|right>")
    eyepacs = subsample_patients([r for r in eyepacs_all if r["name_ok"]], eyepacs_target)
    recs += eyepacs

    # Stage 1: ingest, record checks and fundus check. Cache keyed by content and Pillow version.
    private.mkdir(parents=True, exist_ok=True)
    cache_path = private / "ingest_cache.json"
    try:
        cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    except ValueError:
        cache = {}
    kept = []
    for r in recs:
        if r["source"] == "aptos" and not r["name_ok"]:
            q(r, "ingest", "name_schema", "id_code is not 12 hex characters")
            continue
        if r["grade"] not in (0, 1, 2, 3, 4):
            q(r, "ingest", "grade_range", f"grade {r['grade']!r} is not 0 to 4")
            continue
        p = r["path"]
        if not p.is_file():
            q(r, "ingest", "file_present", "image listed in the labels file is missing")
            continue
        sha = sha256_file(p)
        key = f"{r['source']}/{r['image_id']}:{sha}:h{HASH_SIZE}:b{BORDER_LEVEL}:pil{PIL.__version__}"
        hit = cache.get(key)
        if hit is None:
            try:
                with Image.open(p) as im:
                    im.verify()
                with Image.open(p) as im:
                    w, h = im.size
                    im.load()
                    box, frac = fundus_box(im)
                    hit = {"width": w, "height": h, "sha256": sha, "bytes": p.stat().st_size,
                           "fundus_fraction": round(frac, 4), "has_fundus": box is not None,
                           "dhash": dhash(crop_fundus(im)) if box else 0}
            except Exception as e:  # any decode failure quarantines the file
                hit = {"error": type(e).__name__}
            cache[key] = hit
        if "error" in hit:
            q(r, "ingest", "decodable", f"cannot decode image ({hit['error']})")
            continue
        r = {**r, **hit}
        if min(r["width"], r["height"]) < MIN_SIDE:
            q(r, "ingest", "min_resolution", f"smallest side below the {MIN_SIDE} px model input")
            continue
        if not r["has_fundus"] or r["fundus_fraction"] < MIN_FUNDUS_FRACTION:
            q(r, "fundus", "fundus_present", f"fundus fills {r['fundus_fraction']:.0%} of the frame, "
                                             f"need {MIN_FUNDUS_FRACTION:.0%}")
            continue
        kept.append(r)
    cache_path.write_text(json.dumps(cache))
    if not kept:
        raise HardFail("no image passed the ingest checks")
    df = pd.DataFrame(kept).reset_index(drop=True)
    df["grade"] = df["grade"].astype(int)

    # Stage 2: duplicates. Near-identical copies with different grades all go to review.
    pairs = near_pairs(df["dhash"].tolist())
    clash = {k for i, j, _ in pairs if df.at[i, "grade"] != df.at[j, "grade"] for k in (i, j)}
    for i in sorted(clash):
        q(df.loc[i], "dedup", "duplicate_grade_conflict", "an identical or near-identical image has another grade")
    df = df.drop(index=sorted(clash))
    dup = df.duplicated("sha256", keep="first")
    for _, r in df[dup].iterrows():
        q(r, "dedup", "exact_duplicate", "byte-identical to an earlier file")
    df = df[~dup].reset_index(drop=True)
    pairs = near_pairs(df["dhash"].tolist())
    df["group_id"] = union_groups(df["patient_id"].tolist(), pairs)
    near = [(df.at[i, "image_id"], df.at[j, "image_id"], df.at[i, "source"] != df.at[j, "source"], d)
            for i, j, d in pairs]

    # Stage 3: split by group, stratified by the group's worst grade
    df["referable"] = (df["grade"] >= REFERABLE_GRADE).astype(int)
    groups = df.groupby("group_id")["grade"].max().reset_index().rename(columns={"grade": "label"})
    df["split"] = df["group_id"].map(assign_splits(groups, seed=SEED, fractions=SPLIT))

    # Stage 4: batch checks
    checks = batch_checks(df)
    out.mkdir(parents=True, exist_ok=True)
    if not all(c["passed"] for c in checks):
        (out / "batch_checks_failed.json").write_text(json.dumps(checks, indent=2))
        raise HardFail("batch checks failed, see batch_checks_failed.json")
    (out / "batch_checks_failed.json").unlink(missing_ok=True)

    # Outputs
    df = df.sort_values(["source", "image_id"])
    hashes = df["dhash"].tolist()
    df["dhash"] = df["dhash"].map(lambda h: f"{h:0{HASH_SIZE * HASH_SIZE // 4}x}")
    df["file"] = df["source"] + "/" + df["image_id"] + ".png"
    cols = ["file", "source", "image_id", "patient_id", "eye", "group_id", "grade", "referable", "split",
            "width", "height", "bytes", "sha256", "dhash", "fundus_fraction"]
    df[cols].to_csv(out / "manifest.csv", index=False)
    qdf = pd.DataFrame(quarantine, columns=["source", "image_id", "grade", "stage", "check", "reason"])
    qdf.to_csv(out / "quarantine.csv", index=False)
    pd.DataFrame(near, columns=["image_a", "image_b", "cross_source", "hamming_bits"]).to_csv(
        out / "near_duplicates.csv", index=False)
    if write_copies:
        for r in df.itertuples():
            dest = private / "images" / r.file
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(r.path) as im:
                    crop_fundus(im).save(dest)

    version = hashlib.sha256("\n".join(df["file"] + ":" + df["sha256"] + ":" + df["split"]).encode()).hexdigest()[:16]

    def counts(g, col):
        return {str(k): int(v) for k, v in g[col].value_counts().sort_index().items()}

    report = {
        "dataset": "APTOS 2019 + EyePACS (Kaggle DR 2015) subsample",
        "dataset_version_hash": version,
        "pipeline_version": PIPELINE_VERSION,
        "preprocessing": "dr-pre-1 (crop border, pad square, resize)",
        "seed": SEED,
        "run_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
        "pillow": PIL.__version__, "code_commit": code_commit(),
        "eyepacs_listed": len(eyepacs_all), "eyepacs_sampled": len(eyepacs),
        "records_kept": int(len(df)), "records_quarantined": int(len(qdf)),
        "quarantine_by_check": qdf["check"].value_counts().to_dict(),
        "near_duplicate_pairs": len(near), "cross_source_pairs": int(sum(x[2] for x in near)),
        "near_dup_bits": NEAR_DUP_BITS, "nearest_distance_quantiles": nearest_distance_summary(hashes),
        "intended_population": "not checkable: no age in either source; both are diabetic screening sets",
        "grade_counts": counts(df, "grade"),
        "class_balance": {s: {src: counts(g2, "grade") for src, g2 in g.groupby("source")}
                          for s, g in df.groupby("split")},
        "referable_rate": {s: round(float(g["referable"].mean()), 4) for s, g in df.groupby("split")},
        "batch_checks": checks,
    }
    (out / "run_report.json").write_text(json.dumps(report, indent=2, default=str))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--aptos", default="ml/data/raw/aptos2019")
    ap.add_argument("--eyepacs", default="ml/data/raw/eyepacs")
    ap.add_argument("--out", default="ml/manifests/dr_v1")
    ap.add_argument("--private", default="ml/data/interim/dr_v1")
    ap.add_argument("--eyepacs-target", type=int, default=EYEPACS_TARGET)
    a = ap.parse_args(argv)
    try:
        report = run(Path(a.aptos), Path(a.eyepacs), Path(a.out), Path(a.private), a.eyepacs_target)
    except HardFail as e:
        print(f"HARD FAIL: {e}", file=sys.stderr)
        return 1
    keys = ["dataset_version_hash", "records_kept", "records_quarantined", "quarantine_by_check",
            "near_duplicate_pairs", "cross_source_pairs", "nearest_distance_quantiles", "grade_counts",
            "referable_rate"]
    print(json.dumps({k: report[k] for k in keys}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
