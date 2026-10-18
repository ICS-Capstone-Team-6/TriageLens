"""Baseline ladder for the TB model (story E2-01; Team Rules 7; Prosit 2 C1 and C2).

  rung 0  image width, height and file size only   shortcut check: should score near 0.5
  rung 1  logistic regression on 64 x 64 pixels    the plain baseline
  rung 2  frozen ImageNet backbone + logistic      does fine-tuning add anything?

Each logistic regression picks its regularisation by 5-fold cross-validation on the train
split only, then is scored once on validation. The test split is not read (ML-DATA-04).

Usage:
    python3 ml/train/baselines.py --data ml/data/processed/shenzhen_v1_320 --out ml/runs/baselines
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegressionCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_split  # noqa: E402
from metrics import summarize  # noqa: E402

SEED = 591


def _fit_score(x_train, y_train, x_val, y_val):
    clf = make_pipeline(StandardScaler(), LogisticRegressionCV(
        Cs=10, cv=5, scoring="roc_auc", max_iter=5000, random_state=SEED))
    clf.fit(x_train, y_train)
    return summarize(y_val, clf.predict_proba(x_val)[:, 1], seed=SEED)


def pixels(x_u8, size=64):
    return np.stack([np.asarray(Image.fromarray(img).resize((size, size), Image.BOX),
                                dtype=np.float32).ravel() for img in x_u8])


def frozen_features(x_u8, backbone, batch=64):
    import torch

    from models import TBNet
    from preprocess import normalize

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = TBNet(backbone, pretrained=True).to(device).eval()
    feats = []
    with torch.no_grad():
        for i in range(0, len(x_u8), batch):
            x = torch.from_numpy(normalize(x_u8[i:i + batch])).to(device)
            feats.append(model.forward_features(x).mean(dim=(2, 3)).cpu().numpy())
    return np.concatenate(feats)


def run(data_dir, out_dir, backbones=("mobilenetv3_large", "efficientnet_lite0"), log=print):
    tr, va = load_split(data_dir, "train"), load_split(data_dir, "val")
    prep = json.loads((Path(data_dir) / "prepare_report.json").read_text())
    report = {"dataset_version_hash": prep["dataset_version_hash"], "split": "val", "results": {}}
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    def record(name, result):
        # saved after every rung, so a later failure does not lose earlier results
        report["results"][name] = result
        (out / "baselines.json").write_text(json.dumps(report, indent=2))
        log(f"{name}: AUROC {result['auroc']:.3f} (95% CI {result['ci95'][0]:.3f} to {result['ci95'][1]:.3f})")

    record("rung0_image_size_only", _fit_score(tr["meta"], tr["y"], va["meta"], va["y"]))
    record("rung1_pixels_64", _fit_score(pixels(tr["x"]), tr["y"], pixels(va["x"]), va["y"]))
    for b in backbones:
        record(f"rung2_frozen_{b}", _fit_score(
            frozen_features(tr["x"], b), tr["y"], frozen_features(va["x"], b), va["y"]))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description="Run the baseline ladder.")
    ap.add_argument("--data", default="ml/data/processed/shenzhen_v1_320")
    ap.add_argument("--out", default="ml/runs/baselines")
    a = ap.parse_args(argv)
    print(json.dumps(run(a.data, a.out), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
