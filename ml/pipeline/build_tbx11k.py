"""Build a validated, versioned split of the TBX11K TB chest X-ray set (training source).

Story E1-03. Rules: TRD 9.2 (ML-DATA-01 to 07), TRD Appendix A (TBX11K: train, validate,
internal test), Team Rules 7 and 8. Reuses the Shenzhen pipeline's helpers
(build_dataset.py) without changing them, so the Shenzhen dataset hash stays the same.

Differences from Shenzhen, all from the data (see the TBX11K DATA_CARD.md):
- Labels come from the class folder in the official list files: health and sick (sick but
  not TB) are 0, tb is 1. There are no free-text readings to check.
- Latent TB ("ObsoletePulmonaryTuberculosis") counts as TB (team decision, 23 Nov 2026),
  as in Montgomery, whose label 1 includes inactive or healed TB. The active/latent subtype
  is read from the COCO annotations when present and kept in the manifest, so sensitivity
  can be reported per subtype.
- No age, sex or patient ID metadata exist. The age 15+ check (TRD 9.1) cannot run; the
  records are accepted and the gap is recorded (team decision, 23 Nov 2026). Each image is
  its own patient ID; near-identical images are still grouped by dHash.
- Splits follow the official lists. Official test labels are not public, so: official
  train -> train; official val -> val and test, half each, stratified and grouped. A
  near-duplicate group that touches official train goes wholly to train.
- Only images in the official train and val lists under health/, sick/ or tb/ are used.
  Anything else (for example an extra/ folder or the unlabelled test/ folder) is
  quarantined, so other public sets bundled with a copy cannot slip in.
- Images matching Shenzhen or Montgomery (SHA-256 or dHash) are quarantined: Montgomery is
  a locked external set, and a Shenzhen copy could cross splits when the sets are combined.
- Found counts must match the official README table, or the run stops.

Outputs
- <out>/manifest.csv, quarantine.csv, near_duplicates.csv, run_report.json (committed):
  paths, labels, splits, hashes and counts only.
- <private>/ingest_cache.json (git-ignored).

Usage (from the repo root, with the archive unpacked under ml/data/raw/tbx11k/):
    python3 ml/pipeline/build_tbx11k.py
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dataset import (HASH_SIZE, MIN_SIDE, NEAR_DUP_BITS, SEED, HardFail,  # noqa: E402
                           batch_checks, code_commit, dhash, sha256_file)

PIPELINE_VERSION = "0.1.0"
DATASET = "TBX11K (Media Computing Lab, Nankai University)"
CLASS_LABEL = {"health": 0, "sick": 0, "tb": 1}
# Official README table (github.com/yun-liu/Tuberculosis): tb = active + latent + both.
EXPECTED = {
    "train": {"health": 3000, "sick": 3000, "tb": 600},
    "val": {"health": 800, "sick": 800, "tb": 200},
}
LIST_FILES = {"train": "TBX11K_train.txt", "val": "TBX11K_val.txt"}
VAL_TEST = {"val": 0.5, "test": 0.5}  # how the official val split is divided
ENTRY_RE = re.compile(r"^(health|sick|tb)/[^/]+\.png$")
ACTIVE, LATENT = 1, 2  # COCO category ids; 3 is the unreleased test-set category


# ---------- small, testable helpers ----------

def parse_list_entry(line):
    """Return the image path relative to imgs/ ('tb/tb0003.png'), or None for a blank line.

    Takes the first token, so a trailing label or box column does not matter, and strips a
    leading './' or 'imgs/'. The path is returned even if it breaks the schema; the caller
    checks it with ENTRY_RE and quarantines it.
    """
    tokens = line.strip().split()
    if not tokens:
        return None
    path = tokens[0].replace("\\", "/")
    for prefix in ("./", "imgs/"):
        if path.startswith(prefix):
            path = path[len(prefix):]
    return path


def find_root(raw):
    """The folder holding imgs/ and lists/: raw itself or one level below (e.g. raw/TBX11K)."""
    if not raw.is_dir():
        raise HardFail(f"raw folder not found: {raw}")
    for cand in [raw] + sorted(p for p in raw.iterdir() if p.is_dir()):
        if (cand / "imgs").is_dir() and (cand / "lists").is_dir():
            return cand
    raise HardFail(f"no folder with imgs/ and lists/ found in {raw} or one level below")


def tb_subtypes(ann_dir):
    """Map image basename -> 'active', 'latent' or 'active_and_latent' from COCO json files.

    Uses only categories 1 (active) and 2 (latent), as the authors ask. Returns {} when no
    annotation files are found; the subtype is then 'unknown'.
    """
    out = {}
    if not ann_dir.is_dir():
        return out
    for path in sorted(ann_dir.rglob("*.json")):
        try:
            coco = json.loads(path.read_text())
        except ValueError:
            continue
        if not isinstance(coco, dict) or "images" not in coco or "annotations" not in coco:
            continue
        names = {im["id"]: Path(im["file_name"]).name for im in coco["images"]}
        cats = {}
        for a in coco["annotations"]:
            if a.get("category_id") in (ACTIVE, LATENT) and a.get("image_id") in names:
                cats.setdefault(names[a["image_id"]], set()).add(a["category_id"])
        for name, c in cats.items():
            c = c | out.get(name, set())
            out[name] = c
    return {n: ("active_and_latent" if c == {ACTIVE, LATENT} else "active" if c == {ACTIVE} else "latent")
            for n, c in out.items()}


def hash_matrix(hashes, bits=HASH_SIZE * HASH_SIZE):
    """256-bit integer hashes -> (n, bits/64) uint64 array for vectorised Hamming distance."""
    words = bits // 64
    mask = (1 << 64) - 1
    return np.array([[(h >> (64 * w)) & mask for w in range(words)] for h in hashes], dtype=np.uint64)


def near_pairs(hashes, max_bits=NEAR_DUP_BITS):
    """All index pairs (i, j, distance), i < j, with Hamming distance <= max_bits.

    Same result as the pairwise loop in build_dataset.near_duplicate_groups, vectorised so
    8,400 images take seconds rather than minutes.
    """
    m = hash_matrix(hashes)
    pairs = []
    for i in range(len(m) - 1):
        d = np.bitwise_count(m[i + 1:] ^ m[i]).sum(axis=1)
        for j in np.nonzero(d <= max_bits)[0]:
            pairs.append((i, i + 1 + int(j), int(d[j])))
    return pairs


def cross_matches(hashes, other_hashes, max_bits=NEAR_DUP_BITS):
    """For each of hashes, the smallest distance to any of other_hashes if <= max_bits, else None."""
    if not len(other_hashes):
        return [None] * len(hashes)
    o = hash_matrix(other_hashes)
    out = []
    for row in hash_matrix(hashes):
        d = int(np.bitwise_count(o ^ row).sum(axis=1).min())
        out.append(d if d <= max_bits else None)
    return out


def union_groups(ids, pairs):
    """Union-find: ids[i] of each record's group root, given index pairs."""
    parent = list(range(len(ids)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, j, _ in pairs:
        parent[find(i)] = find(j)
    return [ids[find(i)] for i in range(len(ids))]


def assign_splits(df, seed=SEED, fractions=VAL_TEST):
    """{group_id: split}. Groups touching official train -> train; the rest (official val
    only) -> val or test, stratified by label, deterministic for a seed."""
    out = {}
    val_only = []
    for gid, g in df.groupby("group_id"):
        if (g["source_split"] == "train").any():
            out[gid] = "train"
        else:
            val_only.append((gid, int(g["label"].max())))
    rng = np.random.default_rng(seed)
    groups = pd.DataFrame(val_only, columns=["group_id", "label"]).sort_values("group_id")
    for _, g in groups.groupby("label"):
        gids = g["group_id"].to_numpy().copy()
        rng.shuffle(gids)
        n_va = round(len(gids) * fractions["val"])
        for k, gid in enumerate(gids):
            out[gid] = "val" if k < n_va else "test"
    return out


def load_other(manifest):
    """(sha256 set, dHash ints) of a committed manifest from another source."""
    m = pd.read_csv(manifest, dtype=str)
    return set(m["sha256"]), [int(h, 16) for h in m["dhash"]]


# ---------- pipeline ----------

def run(raw, out, private, other_manifests, expected=EXPECTED):
    root = find_root(raw)
    img_dir, list_dir = root / "imgs", root / "lists"
    quarantine = []

    def q(rec, stage, check, reason):
        quarantine.append({"file": rec.get("file"), "label": rec.get("label"),
                           "stage": stage, "check": check, "reason": reason})

    # Stage 1: read the official lists
    entries = []
    for split, name in LIST_FILES.items():
        path = list_dir / name
        if not path.exists():
            found = sorted(p.name for p in list_dir.iterdir())
            raise HardFail(f"list file {name} not in {list_dir}; found {found}")
        for line in path.read_text().splitlines():
            rel = parse_list_entry(line)
            if rel is not None:
                entries.append((rel, split))
    seen = {}
    for rel, split in entries:
        if rel in seen and seen[rel] != split:
            raise HardFail(f"{rel} is in both the train and the val list")
        seen[rel] = split
    found = {s: {c: 0 for c in CLASS_LABEL} for s in LIST_FILES}
    for rel, split in seen.items():
        cls = rel.split("/")[0]
        if cls in found[split]:
            found[split][cls] += 1
    source_check = {"check": "source_matches_official_counts", "passed": found == expected,
                    "detail": f"found {found}, official {expected}"}
    if not source_check["passed"]:
        raise HardFail(f"list counts differ from the official table: {source_check['detail']}")

    # Stage 2: ingest and record checks (cache as in build_dataset.py)
    subtypes = tb_subtypes(root / "annotations")
    private.mkdir(parents=True, exist_ok=True)
    cache_path = private / "ingest_cache.json"
    try:
        cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    except ValueError:
        cache = {}
    new_entries = 0
    recs = []
    for rel, split in sorted(seen.items()):
        rec = {"file": rel, "source_split": split}
        if not ENTRY_RE.match(rel):
            q(rec, "ingest", "list_entry_schema", "not a health/, sick/ or tb/ PNG in the official lists")
            continue
        cls = rel.split("/")[0]
        rec.update(source_class=cls, label=CLASS_LABEL[cls])
        p = img_dir / rel
        if not p.is_file():
            q(rec, "ingest", "file_present", "listed image is missing")
            continue
        content_sha = sha256_file(p)
        key = f"{rel}:{content_sha}:h{HASH_SIZE}:pil{PIL.__version__}"
        hit = cache.get(key)
        if hit is None:
            try:
                with Image.open(p) as im:
                    im.verify()
                with Image.open(p) as im:
                    im.load()
                    hit = {"width": im.width, "height": im.height, "mode": im.mode,
                           "dhash": dhash(im), "sha256": content_sha, "bytes": p.stat().st_size}
            except Exception as e:  # any decode failure quarantines the file
                hit = {"error": type(e).__name__}
            cache[key] = hit
            new_entries += 1
            if new_entries % 500 == 0:
                cache_path.write_text(json.dumps(cache))
        if "error" in hit:
            q(rec, "ingest", "decodable", f"cannot decode image ({hit['error']})")
            continue
        rec.update(hit)
        if min(rec["width"], rec["height"]) < MIN_SIDE:
            q(rec, "ingest", "min_resolution", f"smallest side below the {MIN_SIDE} px quality floor")
            continue
        rec["tb_subtype"] = (subtypes.get(Path(rel).name, "unknown") if rec["label"] else "")
        recs.append(rec)
    if new_entries:
        cache_path.write_text(json.dumps(cache))
    if not recs:
        raise HardFail("no image passed the ingest checks")
    df = pd.DataFrame(recs).reset_index(drop=True)
    df["patient_id"] = df["file"].str.replace(r"\.png$", "", regex=True)  # no patient IDs exist

    # Stage 3: overlap with the other sources (locked external and other training sets)
    overlap = {}
    for src, manifest in other_manifests.items():
        shas, hashes = load_other(manifest)
        near = cross_matches(df["dhash"].tolist(), hashes)
        for i, r in df.iterrows():
            if r["file"] in overlap:
                continue
            if r["sha256"] in shas:
                overlap[r["file"]] = (src, f"byte-identical to a {src} image")
            elif near[i] is not None:
                overlap[r["file"]] = (src, f"within {near[i]} dHash bits of a {src} image")
    hit = df["file"].isin(overlap)
    for _, r in df[hit].iterrows():
        q(r, "dedup", "other_source_overlap", overlap[r["file"]][1])
    df = df[~hit].reset_index(drop=True)

    # Stage 4: duplicates within TBX11K. Copies with different labels all go to review.
    pairs = near_pairs(df["dhash"].tolist())
    labels = df["label"].to_numpy()
    # identical bytes give distance 0, so near_pairs covers exact copies too
    clash = {k for i, j, _ in pairs if labels[i] != labels[j] for k in (i, j)}
    for i in sorted(clash):
        q(df.loc[i], "dedup", "duplicate_label_conflict", "an identical or near-identical image has the other label")
    df = df.drop(index=sorted(clash)).reset_index(drop=True)
    dup = df.duplicated("sha256", keep="first")
    for _, r in df[dup].iterrows():
        q(r, "dedup", "exact_duplicate", "byte-identical to an earlier file")
    df = df[~dup].reset_index(drop=True)
    pairs = near_pairs(df["dhash"].tolist())
    ids = df["patient_id"].tolist()
    df["group_id"] = union_groups(ids, pairs)
    near_rows = [(ids[i], ids[j], d) for i, j, d in pairs]

    # Stage 5: intended-use policy. No age metadata: accepted and recorded (see docstring).

    # Stage 6: split
    splits = assign_splits(df)
    df["split"] = df["group_id"].map(splits)
    moved = int(((df["source_split"] == "val") & (df["split"] == "train")).sum())

    # Stage 7: batch checks
    checks = [source_check] + batch_checks(df)
    checks.append({"check": "no_other_source_overlap", "passed": not df["file"].isin(overlap).any(),
                   "detail": f"{len(overlap)} image(s) matched another source and were quarantined"})
    out.mkdir(parents=True, exist_ok=True)
    if not all(c["passed"] for c in checks):
        (out / "batch_checks_failed.json").write_text(json.dumps(checks, indent=2))
        raise HardFail("batch checks failed, see batch_checks_failed.json")
    (out / "batch_checks_failed.json").unlink(missing_ok=True)

    # Outputs
    df = df.sort_values("file")
    df["dhash"] = df["dhash"].map(lambda h: f"{h:0{HASH_SIZE * HASH_SIZE // 4}x}")
    cols = ["file", "patient_id", "group_id", "label", "split", "width", "height", "bytes", "sha256",
            "dhash", "source_split", "source_class", "tb_subtype"]
    df[cols].to_csv(out / "manifest.csv", index=False)
    qdf = pd.DataFrame(quarantine, columns=["file", "label", "stage", "check", "reason"])
    qdf.to_csv(out / "quarantine.csv", index=False)
    pd.DataFrame(near_rows, columns=["patient_a", "patient_b", "hamming_bits"]).to_csv(
        out / "near_duplicates.csv", index=False)

    version = hashlib.sha256("\n".join(df["file"] + ":" + df["sha256"] + ":" + df["split"]).encode()).hexdigest()[:16]
    tb = df[df["label"] == 1]
    report = {
        "dataset": DATASET,
        "dataset_version_hash": version,
        "pipeline_version": PIPELINE_VERSION,
        "role": "train, validate, internal test (TRD Appendix A)",
        "seed": SEED,
        "run_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "pandas": pd.__version__,
        "pillow": PIL.__version__,
        "code_commit": code_commit(),
        "image_root": str(img_dir.relative_to(raw)),
        "list_entries": len(seen),
        "records_kept": int(len(df)),
        "records_quarantined": int(len(qdf)),
        "quarantine_by_check": qdf["check"].value_counts().to_dict(),
        "quarantine_by_check_and_label": {f"{c} (label {lab})": int(n) for (c, lab), n in
                                          qdf.groupby(["check", "label"], dropna=False).size().items()},
        "other_source_overlap": pd.Series([s for s, _ in overlap.values()], dtype=str).value_counts().to_dict(),
        "near_duplicate_pairs": len(near_rows),
        "val_records_moved_to_train": moved,
        "label_counts": {str(k): int(v) for k, v in df["label"].value_counts().items()},
        "class_counts": df["source_class"].value_counts().to_dict(),
        "tb_subtype_counts": tb["tb_subtype"].value_counts().to_dict(),
        "split_counts": {s: {str(k): int(v) for k, v in g["label"].value_counts().items()}
                         for s, g in df.groupby("split")},
        "split_class_counts": {s: g["source_class"].value_counts().to_dict() for s, g in df.groupby("split")},
        "image_modes": df["mode"].value_counts().to_dict(),
        "resolution_px": {"smallest_side_min": int(df[["width", "height"]].min(axis=1).min()),
                          "largest_side_max": int(df[["width", "height"]].max(axis=1).max())},
        "age_check": "not run: TBX11K has no age metadata; accepted and recorded (TRD 9.1 gap)",
        "batch_checks": checks,
    }
    (out / "run_report.json").write_text(json.dumps(report, indent=2, default=str))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", default="ml/data/raw/tbx11k")
    ap.add_argument("--out", default="ml/manifests/tbx11k_v1")
    ap.add_argument("--private", default="ml/data/interim/tbx11k_v1")
    ap.add_argument("--shenzhen-manifest", default="ml/manifests/shenzhen_v2/manifest.csv")
    ap.add_argument("--montgomery-manifest", default="ml/manifests/montgomery_v1/manifest.csv")
    a = ap.parse_args(argv)
    others = {"Shenzhen": Path(a.shenzhen_manifest), "Montgomery": Path(a.montgomery_manifest)}
    try:
        report = run(Path(a.raw), Path(a.out), Path(a.private), others)
    except HardFail as e:
        print(f"HARD FAIL: {e}", file=sys.stderr)
        return 1
    keys = ["dataset_version_hash", "list_entries", "records_kept", "records_quarantined",
            "quarantine_by_check", "other_source_overlap", "near_duplicate_pairs",
            "val_records_moved_to_train", "label_counts", "tb_subtype_counts", "split_counts"]
    print(json.dumps({k: report[k] for k in keys}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
