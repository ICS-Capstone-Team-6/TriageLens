"""Write the class activation map head for the app (ADR-9; E6-02, E10-07).

The shipped ONNX model already outputs `features` (1, C, h, w). The heatmap is
cam[h, w] = sum_c w_c * features[c, h, w], with w the weights of the final layer
(models.TBNet.cam). Those weights are inside the ONNX graph, where the app cannot read
them, so this script writes them to a small JSON file next to the thresholds file:

    apps/pwa/public/config/cam_head.json

The file names the run and the SHA-256 of the exact model file it belongs to. The app
draws no heatmap when the hash differs (hazard H7), when the channel count does not
match the model's feature map, or when the file is missing. Writing it does not change
the model, its outputs, thresholds or any metric.

Usage (on the machine that has the frozen run):
    python3 ml/export/write_cam_head.py --run ml/runs/<run> --model <the shipped .onnx> \\
        --out apps/pwa/public/config/cam_head.json
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

TRAIN_CODE = Path(__file__).resolve().parents[1] / "train"
sys.path.insert(0, str(TRAIN_CODE))

VERSION = "cam-head-1"


def cam_head(model, run_id, model_sha256):
    """The final layer of a TBNet as plain numbers, bound to one model file."""
    w = model.fc.weight.detach().cpu().numpy()
    if w.shape[0] != 1:
        raise ValueError(f"expected one TB output, got {w.shape[0]}")
    return {
        "version": VERSION,
        "run_id": run_id,
        "model_sha256": model_sha256.lower(),
        "channels": int(w.shape[1]),
        "weight": [float(v) for v in w[0]],
        "bias": float(model.fc.bias.detach().cpu().numpy()[0]),
    }


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv=None):
    import torch
    from models import TBNet

    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--run", required=True, type=Path)
    p.add_argument("--model", required=True, type=Path, help="the exact .onnx file the app ships")
    p.add_argument("--out", required=True, type=Path)
    a = p.parse_args(argv)
    cfg = json.loads((a.run / "config.json").read_text())
    model = TBNet(cfg["backbone"], pretrained=False)
    model.load_state_dict(torch.load(a.run / "best.pt", map_location="cpu", weights_only=True))
    head = cam_head(model.eval(), a.run.name, sha256_file(a.model))
    a.out.write_text(json.dumps(head, indent=1) + "\n")
    print(f"wrote {a.out}: {head['channels']} channels for {head['run_id']}")


if __name__ == "__main__":
    main()
