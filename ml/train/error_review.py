"""Error review with heatmaps for the frozen model (Prosit 2 C2; TRD 9.8; hazard H11).

Two parts:

1. `review` (runs on Modal, needs the model): for each set, take the worst errors at the
   evaluation threshold (the TB images scored lowest and the normal images scored highest),
   draw the class activation map (ADR-9) over the image exactly as the model saw it
   (stretched to 320 by 320), and measure how much of the heat falls in the outer border
   band, where Shenzhen films carry text and markers. Writes one PNG per error, a contact
   sheet per set, and review_sheet.csv for two reviewers to tag.

2. `agreement` (runs anywhere, no model): once two reviewers have filled in their tags,
   reports raw agreement and Cohen's kappa (Prosit 2 Section A3 and B3).

Locked sets: Montgomery was scored once by evaluate.py. This review re-reads it only to
DESCRIBE its errors. Nothing here changes the model or the threshold, and a change prompted
by these images cannot be re-tested on Montgomery; it would need new external data.

The images are patient data: outputs stay in the triagelens-runs volume and the git-ignored
ml/runs/ folder, never in the repository or in chat.

Usage:
    modal run ml/modal/train_app.py::review
    modal volume get --force triagelens-runs /review ml/runs/
    python3 ml/train/error_review.py agreement ml/runs/review/<run>/review_sheet.csv
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

TAGS = ("label_error", "image_quality", "shortcut", "true_miss", "unsure")
BORDER = 0.12  # same band as the border-mask check in training and evaluation
SHEET_COLUMNS = ["set", "file", "label", "prob_tb", "error", "aspect", "landscape",
                 "border_heat_share", "image", "reviewer_1_tag", "reviewer_2_tag", "notes"]


def border_share(cam, frac=BORDER):
    """Share of the positive heat that lies in the outer band of the image."""
    pos = np.clip(cam, 0, None)
    total = pos.sum()
    if total <= 0:
        return 0.0
    h, w = pos.shape
    bh, bw = int(round(h * frac)), int(round(w * frac))
    inner = pos[bh:h - bh, bw:w - bw].sum()
    return float((total - inner) / total)


def worst_errors(y, prob, threshold, per_kind):
    """Indices of the worst false negatives (lowest TB score) and false positives
    (highest TB score) at the threshold, at most per_kind of each."""
    y, prob = np.asarray(y), np.asarray(prob)
    fn = np.where((y == 1) & (prob < threshold))[0]
    fp = np.where((y == 0) & (prob >= threshold))[0]
    fn = fn[np.argsort(prob[fn], kind="mergesort")][:per_kind]
    fp = fp[np.argsort(-prob[fp], kind="mergesort")][:per_kind]
    return [(int(i), "missed_tb") for i in fn] + [(int(i), "false_alarm") for i in fp]


def _cams(model, x_u8, spec, batch=32):
    import torch
    import torch.nn.functional as F

    from preprocess import normalize

    probs, cams = [], []
    with torch.no_grad():
        for i in range(0, len(x_u8), batch):
            x = torch.from_numpy(normalize(x_u8[i:i + batch], spec))
            logit, fmap = model(x, return_features=True)
            cam = model.cam(fmap)[:, None]
            cam = F.interpolate(cam, size=x.shape[-2:], mode="bilinear", align_corners=False)[:, 0]
            probs.append(torch.sigmoid(logit).numpy())
            cams.append(cam.numpy())
    return np.concatenate(probs), np.concatenate(cams)


def _figure(img_u8, cam, title, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    pos = np.clip(cam, 0, None)
    pos = pos / pos.max() if pos.max() > 0 else pos
    fig, axes = plt.subplots(1, 2, figsize=(6.4, 3.4), dpi=110)
    axes[0].imshow(img_u8, cmap="gray", vmin=0, vmax=255)
    axes[0].set_title("Model input (320 x 320)", fontsize=8)
    axes[1].imshow(img_u8, cmap="gray", vmin=0, vmax=255)
    # low heat is left transparent so the anatomy stays visible under the overlay
    axes[1].imshow(np.ma.masked_less(pos, 0.15), cmap="inferno", alpha=0.55, vmin=0, vmax=1)
    h, w = img_u8.shape
    bh, bw = h * BORDER, w * BORDER
    axes[1].add_patch(plt.Rectangle((bw, bh), w - 2 * bw, h - 2 * bh, fill=False, ls="--", lw=0.8, ec="#2a78d6"))
    axes[1].set_title("TB heat; dashed line: border band", fontsize=8)
    for a in axes:
        a.axis("off")
    fig.suptitle(title, fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def _contact_sheet(paths, out, cols=4):
    from PIL import Image

    if not paths:
        return None
    ims = [Image.open(p).convert("RGB") for p in paths]
    w, h = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * h), "white")
    for k, im in enumerate(ims):
        sheet.paste(im, ((k % cols) * w, (k // cols) * h))
    sheet.save(out)
    return out


def review(run_dir, sets, threshold, out_dir, per_kind=5, log=print):
    """sets: {name: (processed folder, split)}. threshold: the evaluation's probability
    threshold, taken from validation. Returns the rows of the review sheet."""
    import pandas as pd
    import torch

    from data import load_split
    from models import TBNet
    from preprocess import load_spec

    run_dir, out_dir = Path(run_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    spec = load_spec()
    cfg = json.loads((run_dir / "config.json").read_text())
    model = TBNet(cfg["backbone"], pretrained=False)
    model.load_state_dict(torch.load(run_dir / "best.pt", map_location="cpu", weights_only=True))
    model.eval()

    rows, summary = [], {}
    for name, (data_dir, split) in sets.items():
        log(f"reviewing {name} ({split}): worst {per_kind} missed TB and {per_kind} false alarms")
        d = load_split(data_dir, split, allow_test=True)  # description only, see module notes
        prob, cams = _cams(model, d["x"], spec)
        aspect = d["meta"][:, 0] / d["meta"][:, 1]
        summary[name] = compare_errors(d["y"], prob, threshold, np.array([border_share(c) for c in cams]),
                                       aspect > 1.05)
        paths = []
        for rank, (i, kind) in enumerate(worst_errors(d["y"], prob, threshold, per_kind), start=1):
            img = out_dir / name / f"{rank:02d}_{kind}_{Path(str(d['files'][i])).stem}.png"
            img.parent.mkdir(parents=True, exist_ok=True)
            share = border_share(cams[i])
            what = {"missed_tb": "missed TB", "false_alarm": "false alarm"}[kind]
            title = (f"{name} #{rank}: {what}   label {int(d['y'][i])}   "
                     f"TB prob {prob[i]:.3f} (threshold {threshold:.3f})   border heat {share:.0%}"
                     + ("   LANDSCAPE" if aspect[i] > 1.05 else ""))
            _figure(d["x"][i], cams[i], title, img)
            paths.append(img)
            rows.append({"set": name, "file": str(d["files"][i]), "label": int(d["y"][i]),
                         "prob_tb": round(float(prob[i]), 4), "error": kind,
                         "aspect": round(float(aspect[i]), 3), "landscape": bool(aspect[i] > 1.05),
                         "border_heat_share": round(share, 3), "image": str(img.relative_to(out_dir)),
                         "reviewer_1_tag": "", "reviewer_2_tag": "", "notes": ""})
        _contact_sheet(paths, out_dir / f"contact_sheet_{name}.png")
    pd.DataFrame(rows, columns=SHEET_COLUMNS).to_csv(out_dir / "review_sheet.csv", index=False)
    (out_dir / "review_summary.json").write_text(json.dumps({"threshold": threshold, "sets": summary}, indent=2))
    (out_dir / "HOW_TO_REVIEW.md").write_text(HOW_TO)
    return rows, summary


def compare_errors(y, prob, threshold, border, landscape):
    """Machine-measured error analysis, no radiology needed: do the model's errors put more
    heat on the border band (text, markers) than its correct calls, and are landscape films
    over-represented among errors? Every image of the set is used, not only the worst."""
    y, prob, border, landscape = map(np.asarray, (y, prob, border, landscape))
    wrong = (prob >= threshold) != (y == 1)
    out = {"n": int(len(y)), "errors": int(wrong.sum()),
           "missed_tb": int(((y == 1) & (prob < threshold)).sum()),
           "false_alarms": int(((y == 0) & (prob >= threshold)).sum())}
    for key, sel in (("errors", wrong), ("correct", ~wrong)):
        out[f"border_heat_median_{key}"] = round(float(np.median(border[sel])), 3) if sel.any() else None
        out[f"landscape_share_{key}"] = round(float(landscape[sel].mean()), 3) if sel.any() else None
    if landscape.any() and (~landscape).any():
        out["error_rate_landscape"] = round(float(wrong[landscape].mean()), 3)
        out["error_rate_portrait"] = round(float(wrong[~landscape].mean()), 3)
    return out


HOW_TO = """# How to tag these errors

Each image shows the X-ray as the model saw it (stretched to 320 by 320) and, on the right,
where the TB score came from (bright = pushed the score towards TB). The dashed line marks the
border band, where Shenzhen films carry text and markers.

Two reviewers tag every row of review_sheet.csv independently, without seeing each other's
tags, in the columns reviewer_1_tag and reviewer_2_tag. Use exactly one of:

- shortcut       heat mainly on text, markers, borders or outside the lungs
- image_quality  the film itself is poor: exposure, rotation, cropping, artefacts
- label_error    the image and its written reading suggest the label is wrong
- true_miss      the model looked at the lungs and still got it wrong
- unsure         cannot tell; say why in notes (for example "needs a clinician")

Compare with the written reading (in the git-ignored ml/data/interim/ metadata) before
choosing label_error. We are not radiologists: use unsure rather than guess.

Then run:  python3 ml/train/error_review.py agreement review_sheet.csv
"""


def cohen_kappa(a, b, labels=TAGS):
    """Chance-corrected agreement between two raters over the same items."""
    a, b = list(a), list(b)
    n = len(a)
    if n == 0:
        raise ValueError("no rows have both reviewer_1_tag and reviewer_2_tag filled in yet; "
                         "tag the sheet first (HOW_TO_REVIEW.md)")
    observed = sum(x == y for x, y in zip(a, b)) / n
    expected = sum((a.count(k) / n) * (b.count(k) / n) for k in labels)
    kappa = (observed - expected) / (1 - expected) if expected < 1 else 1.0
    return {"n": n, "raw_agreement": round(observed, 3), "chance_agreement": round(expected, 3),
            "cohen_kappa": round(kappa, 3)}


def agreement(sheet_path):
    import pandas as pd

    df = pd.read_csv(sheet_path, dtype=str).fillna("")
    both = df[(df["reviewer_1_tag"] != "") & (df["reviewer_2_tag"] != "")]
    bad = sorted(set(both["reviewer_1_tag"]).union(both["reviewer_2_tag"]) - set(TAGS))
    if bad:
        raise ValueError(f"unknown tags {bad}; use one of {TAGS}")
    out = {"all": cohen_kappa(both["reviewer_1_tag"], both["reviewer_2_tag"])}
    for name, g in both.groupby("set"):
        out[name] = cohen_kappa(g["reviewer_1_tag"], g["reviewer_2_tag"])
    agreed = both[both["reviewer_1_tag"] == both["reviewer_2_tag"]]
    out["agreed_tags"] = agreed.groupby(["set", "error", "reviewer_1_tag"]).size().rename("n").reset_index() \
        .to_dict("records")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Error review helpers.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("agreement", help="raw agreement and Cohen's kappa from a filled review sheet")
    s.add_argument("sheet")
    a = ap.parse_args(argv)
    print(json.dumps(agreement(a.sheet), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
