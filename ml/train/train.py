"""Train one TB model run (story E2-01; TRD 9.4; ADR-14, ADR-15).

Recipe: ImageNet weights, a short head-only warm-up, then all layers with AdamW and a
cosine schedule, mixed precision on GPU, early stopping on validation AUROC. Only the
train and validation splits are read; the test split stays locked (ML-DATA-04).

Combined data (combine_data.py, several sources): the checkpoint is picked on the mean of
the per-source validation AUROCs, not the pooled AUROC, and metrics.json reports each
source. sampler="source_balanced" gives every source the same share of each epoch.

Each run writes to <runs>/<backbone>_seed<seed>_<time>/:
  config.json       recipe, seed, code commit, dataset hash, library versions
  history.csv       per-epoch loss and AUROC: train (augmented and clean) and validation
  metrics.json      best validation AUROC with its 95% CI, the fit gap, the shape and border checks
  curves.png        learning curves for the report (ml/train/plot_curves.py)
  val_predictions.csv, best.pt

Usage:
    python3 ml/train/train.py --data ml/data/processed/shenzhen_v2_320 --runs ml/runs \
        --backbone mobilenetv3_large --seed 1
"""

import argparse
import dataclasses
import datetime
import json
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, WeightedRandomSampler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from combine_data import per_source_auroc, selection_auroc, source_balanced_weights  # noqa: E402
from data import Augment, XrayDataset, load_split  # noqa: E402
from metrics import auroc, shape_check, summarize  # noqa: E402
from models import TBNet  # noqa: E402


@dataclasses.dataclass
class Config:
    backbone: str = "mobilenetv3_large"
    seed: int = 1
    pretrained: bool = True
    epochs_head: int = 3  # head-only warm-up (TRD 9.4)
    epochs_max: int = 40  # full fine-tuning, before early stopping
    patience: int = 8  # epochs without a better validation AUROC
    batch_size: int = 32
    lr_head: float = 1e-3
    lr_backbone: float = 2e-4
    weight_decay: float = 1e-4
    label_smoothing: float = 0.05
    num_workers: int = 4
    border_mask: float = 0.12  # share of each side hidden in the shortcut check
    shape_jitter: float = 0.15  # random width/height stretch, 0 = off (data.Augment)
    sampler: str = "natural"  # "natural" or "source_balanced" (combined data only)


SAMPLERS = ("natural", "source_balanced")


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = False


def mask_border(x, frac):
    """Hide the outer band of each image, where Shenzhen X-rays carry text and markers.

    Works on normalised (B, 3, H, W) tensors; the band is set to black.
    """
    pad = torch.tensor([-m / s for m, s in zip((0.485, 0.456, 0.406), (0.229, 0.224, 0.225))],
                       device=x.device, dtype=x.dtype)[None, :, None, None]
    h, w = x.shape[2], x.shape[3]
    bh, bw = int(h * frac), int(w * frac)
    keep = torch.zeros((1, 1, h, w), device=x.device, dtype=torch.bool)
    keep[..., bh:h - bh, bw:w - bw] = True
    return torch.where(keep, x, pad.expand_as(x))


@torch.no_grad()
def predict(model, loader, device, border=0.0):
    model.eval()
    probs, losses, ys = [], [], []
    loss_fn = nn.BCEWithLogitsLoss(reduction="sum")
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        if border:
            x = mask_border(x, border)
        logit = model(x).float()
        losses.append(loss_fn(logit, y).item())
        probs.append(torch.sigmoid(logit).cpu().numpy())
        ys.append(y.cpu().numpy())
    y = np.concatenate(ys)
    return np.concatenate(probs), y, sum(losses) / len(y)


def train_epoch(model, loader, opt, scaler, device, smoothing, sched=None, backbone_eval=False):
    """One pass over the training data. backbone_eval keeps the backbone's BatchNorm
    statistics fixed, for the head-only warm-up."""
    model.train()
    if backbone_eval:
        model.backbone.eval()
    loss_fn = nn.BCEWithLogitsLoss()
    total, n = 0.0, 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        target = y * (1 - smoothing) + 0.5 * smoothing
        opt.zero_grad(set_to_none=True)
        with torch.autocast(device_type=device.type, enabled=device.type == "cuda"):
            loss = loss_fn(model(x).float(), target)
        scaler.scale(loss).backward()
        scaler.step(opt)
        scaler.update()
        if sched is not None:
            sched.step()
        total += loss.item() * len(y)
        n += len(y)
    return total / n


def run(cfg, data_dir, runs_dir, git_commit="unknown", git_dirty=None, log=print):
    set_seed(cfg.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    data_dir = Path(data_dir)
    train_arr, val_arr = load_split(data_dir, "train"), load_split(data_dir, "val")
    train_src, val_src = train_arr.get("source"), val_arr.get("source")
    if cfg.sampler not in SAMPLERS:
        raise ValueError(f"unknown sampler {cfg.sampler!r}, expected one of {SAMPLERS}")
    if cfg.sampler == "source_balanced" and (train_src is None or len(set(train_src)) < 2):
        raise ValueError("sampler 'source_balanced' needs combined data with two or more sources")
    gen = torch.Generator().manual_seed(cfg.seed)
    sampler = None
    if cfg.sampler == "source_balanced":
        sampler = WeightedRandomSampler(torch.from_numpy(source_balanced_weights(train_src)),
                                        num_samples=len(train_arr["y"]), replacement=True, generator=gen)
    train_loader = DataLoader(XrayDataset(train_arr, Augment(cfg.shape_jitter)), batch_size=cfg.batch_size,
                              shuffle=sampler is None, sampler=sampler, generator=gen,
                              num_workers=cfg.num_workers, drop_last=True,
                              persistent_workers=cfg.num_workers > 0)
    val_loader = DataLoader(XrayDataset(val_arr), batch_size=64, num_workers=cfg.num_workers)
    # The training images again, without augmentation: the fair comparison with validation
    # for spotting over- and underfitting (train loss on augmented images is not).
    train_eval_loader = DataLoader(XrayDataset(train_arr), batch_size=64, num_workers=cfg.num_workers)

    model = TBNet(cfg.backbone, pretrained=cfg.pretrained).to(device)
    scaler = torch.amp.GradScaler(enabled=device.type == "cuda")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = Path(runs_dir) / f"{cfg.backbone}_seed{cfg.seed}_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)
    prep = json.loads((data_dir / "prepare_report.json").read_text())
    (run_dir / "config.json").write_text(json.dumps({
        **dataclasses.asdict(cfg),
        "git_commit": git_commit, "git_dirty": git_dirty,
        "dataset_version_hash": prep["dataset_version_hash"],
        "dataset_components": prep.get("components"),  # combined data: each source's hash
        "preprocess_spec": prep["preprocess_spec"],
        "data_dir": str(data_dir), "device": str(device),
        "torch": torch.__version__, "started_utc": stamp,
    }, indent=2))

    history, best_auc, best_epoch, stale = [], -1.0, -1, 0

    def evaluate(epoch, phase, train_loss):
        nonlocal best_auc, best_epoch, stale
        probs, y, val_loss = predict(model, val_loader, device)
        tr_probs, tr_y, tr_loss = predict(model, train_eval_loader, device)
        # one source: plain AUROC; several: mean of per-source AUROCs (combine_data.py)
        val_auc = selection_auroc(y, probs, val_src, auroc)
        tr_auc = selection_auroc(tr_y, tr_probs, train_src, auroc)
        row = {"epoch": epoch, "phase": phase, "train_loss_aug": train_loss,
               "train_loss_clean": tr_loss, "train_auroc_clean": tr_auc,
               "val_loss": val_loss, "val_auroc": val_auc}
        if val_src is not None:
            row.update({f"val_auroc_{k}": v for k, v in per_source_auroc(y, probs, val_src, auroc).items()})
            row["val_auroc_pooled"] = auroc(y, probs)
        history.append(row)
        log(f"epoch {epoch:2d} {phase:4s} train_loss {tr_loss:.4f} train_auroc {tr_auc:.4f} "
            f"val_loss {val_loss:.4f} val_auroc {val_auc:.4f} gap {tr_auc - val_auc:+.4f}")
        if val_auc > best_auc:
            best_auc, best_epoch, stale = val_auc, epoch, 0
            torch.save(model.state_dict(), run_dir / "best.pt")
        else:
            stale += 1

    # Phase 1: head only. The backbone stays in eval mode so its BatchNorm statistics
    # keep their ImageNet values while the new layer learns.
    model.freeze_backbone(True)
    opt = torch.optim.AdamW(model.head_parameters(), lr=cfg.lr_head, weight_decay=cfg.weight_decay)
    for epoch in range(1, cfg.epochs_head + 1):
        loss = train_epoch(model, train_loader, opt, scaler, device, cfg.label_smoothing,
                           backbone_eval=True)
        evaluate(epoch, "head", loss)

    # Phase 2: all layers, cosine schedule over the maximum length, early stopping.
    model.freeze_backbone(False)
    opt = torch.optim.AdamW([
        {"params": model.backbone.parameters(), "lr": cfg.lr_backbone},
        {"params": model.head_parameters(), "lr": cfg.lr_head},
    ], weight_decay=cfg.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=cfg.epochs_max * len(train_loader))
    stale = 0
    for i in range(1, cfg.epochs_max + 1):
        loss = train_epoch(model, train_loader, opt, scaler, device, cfg.label_smoothing, sched)
        evaluate(cfg.epochs_head + i, "full", loss)
        if stale >= cfg.patience:
            log(f"early stop: no better validation AUROC for {cfg.patience} epochs")
            break

    # Best checkpoint: final validation numbers and the shortcut check.
    model.load_state_dict(torch.load(run_dir / "best.pt", map_location=device, weights_only=True))
    probs, y, _ = predict(model, val_loader, device)
    masked, _, _ = predict(model, val_loader, device, border=cfg.border_mask)
    pd.DataFrame(history).to_csv(run_dir / "history.csv", index=False)
    pd.DataFrame({"file": val_arr["files"], "label": y.astype(int), "prob_tb": probs}).to_csv(
        run_dir / "val_predictions.csv", index=False)
    best_row = next(h for h in history if h["epoch"] == best_epoch)
    metrics = {
        "backbone": cfg.backbone, "seed": cfg.seed, "shape_jitter": cfg.shape_jitter,
        "sampler": cfg.sampler,
        "selection_metric": "val_auroc" if val_src is None or len(set(val_src)) < 2
        else "mean_per_source_val_auroc",
        "best_epoch": best_epoch,
        "epochs_run": len(history), "val": summarize(y, probs, seed=cfg.seed),
        # train minus validation AUROC at the best epoch: large = overfitting,
        # both low = underfitting (see ml/train/README.md)
        "fit": {
            "train_auroc_clean": best_row["train_auroc_clean"],
            "val_auroc": best_row["val_auroc"],
            "gap": best_row["train_auroc_clean"] - best_row["val_auroc"],
            "best_epoch_is_last": best_epoch == len(history),
        },
        # ADR-16: does the score follow image shape (aspect ratio) instead of the lungs?
        "shape_check": shape_check(y, probs, val_arr["meta"][:, 0] / val_arr["meta"][:, 1]),
        "shortcut_check": {
            "border_masked": cfg.border_mask,
            "val_auroc_masked": auroc(y, masked),
            "drop": auroc(y, probs) - auroc(y, masked),
        },
    }
    if val_src is not None and len(set(val_src)) > 1:
        names = sorted(set(val_src))
        metrics["val_by_source"] = {}
        for k in names:
            m = val_src == k
            metrics["val_by_source"][k] = summarize(y[m], probs[m], seed=cfg.seed)
            metrics["val_by_source"][k]["shape_check"] = shape_check(
                y[m], probs[m], val_arr["meta"][m, 0] / val_arr["meta"][m, 1])
        # How much the source alone predicts the label in validation (as rung 0 for shape):
        # far from 0.5 means a model can gain pooled AUROC by recognising the source.
        metrics["source_check"] = {
            "source_alone_auroc": {k: auroc(y, (val_src == k).astype(float)) for k in names},
            "mean_score_by_source_and_label": {
                k: {str(lab): float(probs[(val_src == k) & (y == lab)].mean()) for lab in (0, 1)}
                for k in names},
        }
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    try:
        from plot_curves import plot_run
        plot_run(run_dir)
    except ImportError:
        log("matplotlib not installed: curves.png skipped (run ml/train/plot_curves.py later)")
    log(json.dumps(metrics, indent=2))
    return run_dir, metrics


def main(argv=None):
    ap = argparse.ArgumentParser(description="Train one TB model run.")
    ap.add_argument("--data", default="ml/data/processed/shenzhen_v2_320")
    ap.add_argument("--runs", default="ml/runs")
    ap.add_argument("--backbone", default="mobilenetv3_large")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--epochs-max", type=int, default=40)
    ap.add_argument("--no-pretrained", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--git-commit", default="unknown")
    ap.add_argument("--sampler", default="natural", choices=SAMPLERS)
    a = ap.parse_args(argv)
    cfg = Config(backbone=a.backbone, seed=a.seed, epochs_max=a.epochs_max,
                 pretrained=not a.no_pretrained, num_workers=a.workers, sampler=a.sampler)
    run(cfg, a.data, a.runs, git_commit=a.git_commit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
