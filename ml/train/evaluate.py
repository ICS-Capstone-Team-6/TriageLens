"""One-time evaluation of the frozen model on the locked test sets (stories E2-02, E11-01).

ML-DATA-04: the held-out sets (Shenzhen's held-out validation split, named `test` in the
files, and every external set) are scored once per frozen model, and nothing measured here
is used to choose or tune anything. Enforced per set, not per run:
- each set is reserved atomically (O_EXCL lock file) before its data is read, so two
  attempts can never both score it;
- its result is saved as soon as it is scored, so a retry after a later failure reuses it
  instead of scoring it again;
- a set that was reserved but has no saved result (the attempt died while scoring it) is
  never scored again: the run stops and the gap must be reported.
Before anything is reserved or read, the checkpoint and every prepared folder must match
this code's preprocessing version (check_preprocessing).

What is frozen, and how (ADR-18): the median seed by validation AUROC from a bake-off
summary, at full precision. int8 (QDQ, reduce_range, the setting chosen by the label-free
sweep, ADR-17) is scored beside it for ML-EVAL-03, not shipped.

Operating point: no threshold is tuned on test data. The one operating point reported takes
the threshold that reaches 90% sensitivity on VALIDATION (the TRD target for TB triage) and
applies it unchanged to each test set. Calibration and the three triage zones come later
(E6), also from validation only.

For each set it writes predictions.csv (file, label, scores, aspect ratio) and adds to
eval_report.json: AUROC with 95% CI, sensitivity and specificity at the validation
threshold with Wilson 95% CIs, the int8 AUROC drop, the border-mask check and the shape
check. Subgroups that need personal data (sex, age, inactive TB) are computed afterwards on
the team's machine from predictions.csv and the git-ignored metadata (subgroups.py).
"""

import datetime
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "export"))
from data import load_split  # noqa: E402
from metrics import auroc, shape_check, summarize  # noqa: E402
from models import TBNet  # noqa: E402
from preprocess import check_preprocessing, load_spec, normalize  # noqa: E402

TARGET_SENSITIVITY = 0.90  # TRD 3.4: TB triage at 90% sensitivity
INT8_SETTING = "minmax_reduce_range"  # chosen by the label-free sweep (ADR-17, ADR-18)
BORDER = 0.12  # same border-mask check as training


class AlreadyEvaluated(Exception):
    """The locked sets were already scored for this model (ML-DATA-04)."""


def median_run(summary, backbone):
    """The frozen run under ADR-18: median validation AUROC among the bake-off seeds."""
    entry = summary["summary"][backbone]
    order = np.argsort(entry["val_auroc"], kind="mergesort")
    i = int(order[len(order) // 2])
    return entry["runs"][i], float(entry["val_auroc"][i])


def threshold_for_sensitivity(y, score, target=TARGET_SENSITIVITY):
    """Highest threshold whose sensitivity on (y, score) is at least target."""
    pos = np.sort(np.asarray(score)[np.asarray(y) == 1])[::-1]
    k = int(np.ceil(target * len(pos)))  # positives that must score at or above it
    return float(pos[k - 1])


def wilson(k, n, z=1.96):
    if n == 0:
        return [float("nan"), float("nan")]
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [float(centre - half), float(centre + half)]


def at_threshold(y, score, t):
    y, s = np.asarray(y), np.asarray(score)
    tp, fn = int(((s >= t) & (y == 1)).sum()), int(((s < t) & (y == 1)).sum())
    tn, fp = int(((s < t) & (y == 0)).sum()), int(((s >= t) & (y == 0)).sum())
    return {"threshold": t, "tp": tp, "fn": fn, "tn": tn, "fp": fp,
            "sensitivity": tp / max(tp + fn, 1), "sensitivity_ci95": wilson(tp, tp + fn),
            "specificity": tn / max(tn + fp, 1), "specificity_ci95": wilson(tn, tn + fp)}


@torch.no_grad()
def torch_logits(model, x_u8, spec, border=0.0, batch=32):
    from train import mask_border

    out = []
    for i in range(0, len(x_u8), batch):
        x = torch.from_numpy(normalize(x_u8[i:i + batch], spec))
        if border:
            x = mask_border(x, border)
        out.append(model(x).numpy())
    return np.concatenate(out)


def _sigmoid(z):
    return 1 / (1 + np.exp(-z))


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _write_atomic(path, text):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def reserve(out_dir, name, checkpoint_sha):
    """Claim one locked set, once. False if any attempt already claimed it."""
    locks = out_dir / "locked_sets"
    locks.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(locks / f"{name}.json", os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w") as f:
        json.dump({"set": name, "checkpoint_sha256": checkpoint_sha, "reserved_utc": _now()}, f)
    return True


def set_status(out_dir, name, checkpoint_sha):
    """'new', 'done' (scored and saved) or 'exposed' (claimed, result missing)."""
    lock = out_dir / "locked_sets" / f"{name}.json"
    result = out_dir / "results" / f"{name}.json"
    if result.exists():
        saved = json.loads(result.read_text())
        if saved["checkpoint_sha256"] != checkpoint_sha:
            raise AlreadyEvaluated(f"{name} was scored with another checkpoint in {out_dir}")
        return "done"
    return "exposed" if lock.exists() else "new"


def evaluate(run_dir, sets, out_dir, train_data_dir, int8=True, log=print):
    """sets: {name: (processed folder, split)}, e.g. {"shenzhen_test": (..., "test"),
    "montgomery": (..., "external")}. train_data_dir holds val (threshold) and train
    (int8 calibration images). Returns the report."""
    run_dir, out_dir, train_data_dir = Path(run_dir), Path(out_dir), Path(train_data_dir)
    if (out_dir / "eval_report.json").exists():
        raise AlreadyEvaluated(f"{out_dir} already holds an evaluation; the locked sets are scored once")
    spec = load_spec()
    cfg = json.loads((run_dir / "config.json").read_text())
    # Preflight before any reservation or read of a locked set
    check_preprocessing(cfg, [train_data_dir, *(Path(d) for d, _ in sets.values())], spec)
    checkpoint_sha = _sha256(run_dir / "best.pt")
    status = {name: set_status(out_dir, name, checkpoint_sha) for name in sets}
    exposed = [n for n, st in status.items() if st == "exposed"]
    if exposed:
        raise AlreadyEvaluated(
            f"{exposed} were opened by an earlier attempt that did not finish; they cannot be scored "
            "again (ML-DATA-04). Report the gap; a new frozen candidate is needed for a new score.")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "results").mkdir(exist_ok=True)
    # Every attempt is logged, including ones that crash before producing a result, so the
    # record shows how many times the locked sets were touched (ML-DATA-04).
    attempts_path = out_dir / "attempts.json"
    attempts = json.loads(attempts_path.read_text()) if attempts_path.exists() else []
    attempts.append({"started_utc": _now(), "finished": False,
                     "reused": [n for n, st in status.items() if st == "done"]})
    _write_atomic(attempts_path, json.dumps(attempts, indent=2))
    model = TBNet(cfg["backbone"], pretrained=False)
    model.load_state_dict(torch.load(run_dir / "best.pt", map_location="cpu", weights_only=True))
    model.eval()

    val = load_split(train_data_dir, "val")
    val_logit = torch_logits(model, val["x"], spec)
    t = threshold_for_sensitivity(val["y"], val_logit)
    report = {
        "run": run_dir.name, "backbone": cfg["backbone"], "seed": cfg["seed"],
        "trained_on": cfg.get("dataset_version_hash"), "code_commit_of_run": cfg.get("git_commit"),
        "preprocess_spec": spec["version"], "checkpoint_sha256": checkpoint_sha,
        "evaluated_utc": _now(),
        "operating_point": {"rule": f"threshold reaching {TARGET_SENSITIVITY:.0%} sensitivity on validation",
                            "logit_threshold": t, "probability_threshold": float(_sigmoid(t)),
                            "validation": at_threshold(val["y"], val_logit, t)},
        "int8_setting": INT8_SETTING if int8 else None,
        "sets": {},
    }

    q_path = None
    if int8 and "new" in status.values():
        import export_onnx

        work = out_dir / "onnx"
        work.mkdir(exist_ok=True)
        fp32 = export_onnx.export_fp32(model, work / "fp32.onnx", spec["input_size"])
        calib = export_onnx.calibration_images(load_split(train_data_dir, "train")["x"])
        q_path = export_onnx.quantize(fp32, work / "int8_qdq.onnx", calib, "qdq", spec,
                                      export_onnx.QUANT_CONFIGS[INT8_SETTING])

    import pandas as pd

    for name, (data_dir, split) in sets.items():
        result_path = out_dir / "results" / f"{name}.json"
        if status[name] == "done":
            saved = json.loads(result_path.read_text())
            if saved["logit_threshold"] != t:
                raise AlreadyEvaluated(f"{name} was scored at another threshold; not mixing results")
            log(f"{name}: already scored by an earlier attempt, reusing the saved result")
            report["sets"][name] = saved["entry"]
            continue
        if not reserve(out_dir, name, checkpoint_sha):
            raise AlreadyEvaluated(f"{name} was claimed by another attempt (ML-DATA-04)")
        log(f"scoring {name} ({split}) once")
        d = load_split(data_dir, split, allow_test=True)
        y = d["y"].astype(int)
        logit = torch_logits(model, d["x"], spec)
        masked = torch_logits(model, d["x"], spec, border=BORDER)
        aspect = d["meta"][:, 0] / d["meta"][:, 1]
        prep = json.loads((Path(data_dir) / "prepare_report.json").read_text())
        entry = {
            "split": split, "dataset_version_hash": prep["dataset_version_hash"],
            "fp32": summarize(y, logit), "at_validation_threshold": at_threshold(y, logit, t),
            "border_masked_auroc": auroc(y, masked), "shape_check": shape_check(y, logit, aspect),
        }
        rows = {"file": d["files"], "label": y, "prob_fp32": _sigmoid(logit), "aspect": aspect}
        if q_path is not None:
            import export_onnx

            q_logit, _ = export_onnx.run_onnx(q_path, d["x"], spec)
            entry["int8"] = {**summarize(y, q_logit), "drop": auroc(y, logit) - auroc(y, q_logit),
                             "at_validation_threshold": at_threshold(y, q_logit, t)}
            rows["prob_int8"] = _sigmoid(q_logit)
        pd.DataFrame(rows).to_csv(out_dir / f"predictions_{name}.csv", index=False)
        _write_atomic(result_path, json.dumps({"checkpoint_sha256": checkpoint_sha, "logit_threshold": t,
                                               "scored_utc": _now(), "entry": entry}, indent=2))
        report["sets"][name] = entry
    attempts[-1]["finished"] = True
    _write_atomic(attempts_path, json.dumps(attempts, indent=2))
    report["attempts"] = attempts
    _write_atomic(out_dir / "eval_report.json", json.dumps(report, indent=2))
    return report
