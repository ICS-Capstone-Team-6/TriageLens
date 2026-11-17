"""Learning curves for over- and underfitting checks (story E2-01; Prosit 2 C2).

One run   -> <run>/curves.png: loss (left) and AUROC (right) per epoch, training images
             without augmentation against validation, best epoch and warm-up marked.
Bake-off  -> one panel per backbone, validation AUROC per epoch, one line per seed.

How to read them:
  overfitting   clean train AUROC keeps rising while validation AUROC stalls or falls;
                validation loss turns upward; a wide gap between the two AUROC lines.
  underfitting  both AUROC lines low and close; both losses high and flat;
                best epoch is the last one (still improving when training stopped).

Usage:
    python3 ml/train/plot_curves.py RUN_DIR [RUN_DIR ...]
    python3 ml/train/plot_curves.py --bakeoff out.png RUN_DIR [RUN_DIR ...]
"""

import argparse
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.ticker  # noqa: E402
import pandas as pd  # noqa: E402

# Reference palette (dataviz skill): slots 1 to 3 pass the all-pairs colour-vision checks.
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, MUTED, GRID = "#1f1f1e", "#6b6a63", "#e4e3dd"


def _room_for_labels(ax, last_epoch):
    """Extend the x axis past the last epoch so end labels sit inside the figure."""
    ax.set_xlim(0.5, last_epoch + max(1.5, 0.22 * last_epoch))
    ax.xaxis.set_major_locator(matplotlib.ticker.MaxNLocator(integer=True))
    ax.set_xticks([t for t in ax.get_xticks() if 1 <= t <= last_epoch])


def _style(ax, title, ylabel):
    ax.set_title(title, loc="left", fontsize=11, color=INK, fontweight="semibold")
    ax.set_xlabel("Epoch", color=MUTED, fontsize=9)
    ax.set_ylabel(ylabel, color=MUTED, fontsize=9)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=8)


def _end_labels(ax, items, font_pt=8):
    """Direct labels at line ends, in text ink beside a colour mark, pushed apart when close.

    items: (x, y, text, colour) per line. Call after all lines are drawn.
    """
    fig = ax.figure
    min_gap_px = font_pt * fig.dpi / 72 * 1.3  # one label height plus a little air
    fig.canvas.draw()  # fixes the axis limits so data can be placed in pixels
    to_px, to_data = ax.transData, ax.transData.inverted()
    placed = sorted(((to_px.transform((x, y))[1], x, y, t, c) for x, y, t, c in items))
    ys = [p[0] for p in placed]
    for i in range(1, len(ys)):  # spread upwards from the lowest
        ys[i] = max(ys[i], ys[i - 1] + min_gap_px)
    shift = (ys[-1] - placed[-1][0]) / 2 if len(ys) > 1 else 0  # recentre the group
    for (y_px, x, y, t, c), new_px in zip(placed, ys):
        ax.plot([x], [y], "o", color=c, markersize=4)
        dy_pt = (new_px - shift - y_px) * 72 / fig.dpi
        ax.annotate(t, (x, y), xytext=(6, dy_pt), textcoords="offset points",
                    va="center", fontsize=font_pt, color=INK)


def plot_run(run_dir):
    run_dir = Path(run_dir)
    h = pd.read_csv(run_dir / "history.csv")
    m = json.loads((run_dir / "metrics.json").read_text())
    best, warm = m["best_epoch"], int((h["phase"] == "head").sum())
    last = h["epoch"].iloc[-1]

    fig, (ax_l, ax_a) = plt.subplots(1, 2, figsize=(10, 3.8), dpi=150)
    for ax in (ax_l, ax_a):
        ax.axvspan(0.5, warm + 0.5, color=GRID, alpha=0.5, linewidth=0)
        ax.axvline(best, color=MUTED, linestyle=":", linewidth=1)

    ax_l.plot(h["epoch"], h["train_loss_aug"], color=MUTED, linewidth=1.2, linestyle="--",
              label="Train, augmented")
    ax_l.plot(h["epoch"], h["train_loss_clean"], color=ORANGE, linewidth=2, label="Train, clean")
    ax_l.plot(h["epoch"], h["val_loss"], color=BLUE, linewidth=2, label="Validation")
    _style(ax_l, "Loss", "Binary cross-entropy")
    _room_for_labels(ax_l, last)

    ax_a.plot(h["epoch"], h["train_auroc_clean"], color=ORANGE, linewidth=2, label="Train, clean")
    ax_a.plot(h["epoch"], h["val_auroc"], color=BLUE, linewidth=2, label="Validation")
    ax_a.set_ylim(0.4, 1.01)
    ax_a.annotate(f"best epoch {best}", (best, 0.42), xytext=(4, 0), textcoords="offset points",
                  fontsize=8, color=MUTED)
    _style(ax_a, "AUROC", "AUROC")
    _room_for_labels(ax_a, last)

    gap = m["fit"]["gap"]
    fig.suptitle(f"{m['backbone']}, seed {m['seed']}: validation AUROC {m['val']['auroc']:.3f} "
                 f"(95% CI {m['val']['ci95'][0]:.3f} to {m['val']['ci95'][1]:.3f}), "
                 f"train minus validation {gap:+.3f}",
                 x=0.01, ha="left", fontsize=10, color=INK)
    handles, labels = ax_l.get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=3, frameon=False, fontsize=8,
               bbox_to_anchor=(0.5, -0.02))
    fig.text(0.99, 0.01, "Shaded: head-only warm-up. Dotted: best epoch.", ha="right",
             fontsize=7, color=MUTED)
    fig.tight_layout(rect=(0, 0.06, 1, 0.92))
    _end_labels(ax_l, [(last, h["train_loss_clean"].iloc[-1], "Train", ORANGE),
                       (last, h["val_loss"].iloc[-1], "Validation", BLUE)])
    _end_labels(ax_a, [(last, h["train_auroc_clean"].iloc[-1], "Train", ORANGE),
                       (last, h["val_auroc"].iloc[-1], "Validation", BLUE)])
    out = run_dir / "curves.png"
    fig.savefig(out, facecolor="white")
    plt.close(fig)
    return out


def plot_bakeoff(run_dirs, out):
    runs = []
    for d in run_dirs:
        d = Path(d)
        m = json.loads((d / "metrics.json").read_text())
        runs.append((m["backbone"], m["seed"], pd.read_csv(d / "history.csv")))
    backbones = sorted({b for b, _, _ in runs})
    seed_colours = [BLUE, ORANGE, AQUA]
    fig, axes = plt.subplots(1, len(backbones), figsize=(5 * len(backbones), 3.6), dpi=150,
                             sharey=True, squeeze=False)
    for ax, b in zip(axes[0], backbones):
        mine = sorted((s, h) for bb, s, h in runs if bb == b)
        ends = []
        for i, (seed, h) in enumerate(mine):
            colour = seed_colours[i % len(seed_colours)]
            ax.plot(h["epoch"], h["val_auroc"], color=colour, linewidth=2, label=f"Seed {seed}")
            ends.append((h["epoch"].iloc[-1], h["val_auroc"].iloc[-1], f"Seed {seed}", colour))
        ax.set_ylim(0.4, 1.01)
        ax._tl_ends = ends
        _style(ax, b, "Validation AUROC")
        _room_for_labels(ax, max(e[0] for e in ends))
    handles, labels = axes[0][0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=len(labels), frameon=False, fontsize=8)
    fig.suptitle("Validation AUROC per epoch, by backbone and seed", x=0.01, ha="left",
                 fontsize=10, color=INK)
    fig.tight_layout(rect=(0, 0.08, 1, 0.93))
    for ax in axes[0]:
        _end_labels(ax, ax._tl_ends)
    fig.savefig(out, facecolor="white")
    plt.close(fig)
    return Path(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Draw learning curves for training runs.")
    ap.add_argument("runs", nargs="+", help="run folders holding history.csv and metrics.json")
    ap.add_argument("--bakeoff", help="also draw one comparison figure to this PNG path")
    a = ap.parse_args(argv)
    for d in a.runs:
        print(plot_run(d))
    if a.bakeoff:
        print(plot_bakeoff(a.runs, a.bakeoff))
    return 0


if __name__ == "__main__":
    sys.exit(main())
