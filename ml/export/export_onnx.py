"""Export a trained run to ONNX and quantize it to static int8 (story E5-02; TRD 9.5).

For one run folder (from ml/train/train.py) this writes <run>/onnx/:
  fp32.onnx            full precision, fixed input (1, 3, 320, 320)
  int8_qdq.onnx        static int8, QDQ format
  int8_qop.onnx        static int8, QOperator format
  export_report.json   parity, AUROC per format, int8 drop, size, CAM agreement, CPU latency

Outputs of every file: tb_logit (1,) and features (1, C, h, w), the feature map the app
turns into the class activation map (ADR-9, TRD 9.10 manifest).

Rules applied (ADR-5, ADR-15 rule 2, TRD 9.5):
- int8 AUROC must be within 0.015 of full precision (floor 0.03); size at most 15 MB.
- Calibration images come from the TRAIN split, not validation. Shenzhen validation has
  95 images, and measuring the int8 drop on the images that set the int8 ranges would
  flatter int8. These are activation ranges, not probability calibration, so the rule
  that calibration comes from validation only (Team Rules 7) does not apply to them.
- Only train and validation are read; the test split stays locked (ML-DATA-04).

CPU latency here is measured with ONNX Runtime on the build machine, one thread. It only
ranks the formats; the real numbers come from the reference phone (E5-01, TRD 9.5 step 5).

Usage:
    python3 ml/export/export_onnx.py --run ml/runs/bakeoff/<run> --data <processed dir>
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

TRAIN_CODE = Path(__file__).resolve().parents[1] / "train"
sys.path.insert(0, str(TRAIN_CODE))
from data import load_split  # noqa: E402
from metrics import auroc  # noqa: E402
from models import TBNet  # noqa: E402
from preprocess import load_spec, normalize  # noqa: E402

OPSET = 17
INPUT = "image"
OUTPUTS = ["tb_logit", "features"]
MAX_DROP, FLOOR_DROP, MAX_MB = 0.015, 0.03, 15.0  # ADR-15 rule 2, ADR-5 floor, TRD 10.6
CALIB_IMAGES = 300  # TRD 9.5 asks for about 500; Shenzhen train has 444


class _ForExport(nn.Module):
    """TBNet with both outputs, the TB logit and the feature map, for the app."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, image):
        return self.model(image, return_features=True)


def export_fp32(model, path, size=320):
    # The wrapper must be in eval mode too: torch.onnx.export puts the module back in its
    # original mode afterwards, and a new wrapper starts in train mode, which would switch
    # the model's BatchNorm to batch statistics for anything run after the export.
    wrapper = _ForExport(model).eval()
    torch.onnx.export(wrapper, torch.zeros(1, 3, size, size), str(path),
                      opset_version=OPSET, input_names=[INPUT], output_names=OUTPUTS,
                      do_constant_folding=True)
    import onnx
    onnx.checker.check_model(str(path))
    return path


def calibration_images(train_u8, n=CALIB_IMAGES, seed=591):
    """A fixed random subset of training images (uint8, no augmentation), same every run."""
    idx = np.random.default_rng(seed).permutation(len(train_u8))[:n]
    return train_u8[np.sort(idx)]


def quantize(fp32_path, out_path, calib_u8, fmt, spec=None):
    """Static int8: per-channel int8 weights, uint8 activations, MinMax ranges (ADR-5)."""
    from onnxruntime.quantization import (CalibrationDataReader, CalibrationMethod, QuantFormat,
                                          QuantType, quantize_static)
    from onnxruntime.quantization.shape_inference import quant_pre_process

    spec = spec or load_spec()

    class Reader(CalibrationDataReader):
        def __init__(self):
            self.rewind()

        def get_next(self):
            img = next(self._it, None)
            return None if img is None else {INPUT: normalize(img, spec)[None]}

        def rewind(self):
            self._it = iter(calib_u8)

    # Folds BatchNorm and fills in shapes first, as ONNX Runtime recommends before quantizing.
    prepped = Path(out_path).with_suffix(".prep.onnx")
    quant_pre_process(str(fp32_path), str(prepped))
    quantize_static(str(prepped), str(out_path), Reader(),
                    quant_format={"qdq": QuantFormat.QDQ, "qop": QuantFormat.QOperator}[fmt],
                    per_channel=True, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8,
                    calibrate_method=CalibrationMethod.MinMax)
    prepped.unlink()
    return out_path


def _session(path, threads=1):
    import onnxruntime as ort
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = threads
    opts.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])


def run_onnx(path, x_u8, spec=None):
    """Logits and feature maps for every image, one at a time (the app's batch size)."""
    spec = spec or load_spec()
    sess = _session(path)
    logits, feats = [], []
    for img in x_u8:
        logit, fmap = sess.run(OUTPUTS, {INPUT: normalize(img, spec)[None]})
        logits.append(logit[0])
        feats.append(fmap[0])
    return np.asarray(logits, np.float32), np.asarray(feats, np.float32)


def latency_ms(path, size=320, repeats=20):
    sess = _session(path)
    x = np.zeros((1, 3, size, size), np.float32)
    sess.run(OUTPUTS, {INPUT: x})  # warm-up
    times = []
    for _ in range(repeats):
        t = time.perf_counter()
        sess.run(OUTPUTS, {INPUT: x})
        times.append((time.perf_counter() - t) * 1000)
    return float(np.median(times))


def op_counts(path):
    """Which operations stayed in float in a QOperator model, and how often int8 data is
    converted back and forth. Each conversion costs time on the phone: MobileNetV3's
    HardSigmoid, for example, has no int8 kernel in ONNX Runtime."""
    import onnx
    ops = [n.op_type for n in onnx.load(str(path)).graph.node]
    int8 = {"QuantizeLinear", "DequantizeLinear"}
    floats = sorted({o for o in ops if o not in int8 and not o.startswith(("QLinear", "QGemm"))
                     and o not in ("Squeeze", "Reshape", "Flatten")})
    return {"nodes": len(ops),
            "float_ops": {o: ops.count(o) for o in floats},
            "quantize_dequantize_pairs": ops.count("QuantizeLinear")}


def cam_agreement(feats_a, feats_b, fc_weight):
    """Mean per-image Pearson correlation between two sets of class activation maps."""
    cam_a = np.einsum("nchw,c->nhw", feats_a, fc_weight).reshape(len(feats_a), -1)
    cam_b = np.einsum("nchw,c->nhw", feats_b, fc_weight).reshape(len(feats_b), -1)
    return float(np.mean([np.corrcoef(a, b)[0, 1] for a, b in zip(cam_a, cam_b)]))


def drop_ci(y, ref, other, n=1000, seed=0):
    """Paired bootstrap 95% interval for AUROC(ref) minus AUROC(other)."""
    rng, diffs = np.random.default_rng(seed), []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if 0 < y[i].sum() < len(i):
            diffs.append(auroc(y[i], ref[i]) - auroc(y[i], other[i]))
    return [float(np.percentile(diffs, 2.5)), float(np.percentile(diffs, 97.5))]


def export_run(run_dir, data_dir, log=print):
    run_dir, data_dir = Path(run_dir), Path(data_dir)
    cfg = json.loads((run_dir / "config.json").read_text())
    spec = load_spec()
    if cfg.get("preprocess_spec") not in (None, spec["version"]):
        raise ValueError(f"run used {cfg['preprocess_spec']}, this code is {spec['version']}")
    model = TBNet(cfg["backbone"], pretrained=False)
    model.load_state_dict(torch.load(run_dir / "best.pt", map_location="cpu", weights_only=True))
    model.eval()

    out = run_dir / "onnx"
    out.mkdir(exist_ok=True)
    val, train = load_split(data_dir, "val"), load_split(data_dir, "train")
    y = val["y"].astype(int)

    with torch.no_grad():
        ref_logit = model(torch.from_numpy(normalize(val["x"], spec))).numpy()
    files = {"fp32": export_fp32(model, out / "fp32.onnx", spec["input_size"])}
    calib = calibration_images(train["x"])
    for fmt in ("qdq", "qop"):
        log(f"quantizing {run_dir.name}: {fmt}")
        files[f"int8_{fmt}"] = quantize(files["fp32"], out / f"int8_{fmt}.onnx", calib, fmt, spec)

    fc_w = model.fc.weight[0].detach().numpy()
    results = {}
    for name, path in files.items():
        logit, feats = run_onnx(path, val["x"], spec)
        results[name] = {"logit": logit, "feats": feats}
    fp32 = results["fp32"]
    report = {
        "run": run_dir.name, "backbone": cfg["backbone"], "seed": cfg["seed"],
        "git_commit": cfg.get("git_commit"), "dataset_version_hash": cfg.get("dataset_version_hash"),
        "preprocess_spec": spec["version"], "opset": OPSET, "outputs": OUTPUTS,
        "calibration": {"split": "train", "images": int(len(calib)), "method": "MinMax",
                        "weights": "int8 per channel", "activations": "uint8"},
        "val_n": int(len(y)),
        # ONNX fp32 must give the same answer as PyTorch before int8 means anything
        "parity_fp32_max_abs_logit": float(np.max(np.abs(fp32["logit"] - ref_logit))),
        "auroc_pytorch": auroc(y, ref_logit),
        "formats": {},
    }
    for name, path in files.items():
        r = results[name]
        entry = {"file": path.name, "size_mb": path.stat().st_size / 2**20,
                 "auroc": auroc(y, r["logit"]), "cpu_latency_ms_1thread": latency_ms(path)}
        if name != "fp32":
            p_fp, p_q = 1 / (1 + np.exp(-fp32["logit"])), 1 / (1 + np.exp(-r["logit"]))
            entry.update({
                "auroc_drop": report["formats"]["fp32"]["auroc"] - entry["auroc"],
                "auroc_drop_ci95": drop_ci(y, fp32["logit"], r["logit"]),
                "max_abs_prob_diff": float(np.max(np.abs(p_fp - p_q))),
                "cam_corr_with_fp32": cam_agreement(fp32["feats"], r["feats"], fc_w),
            })
            if name == "int8_qop":
                entry["ops"] = op_counts(path)
            entry["passes"] = {"drop_le_0.015": entry["auroc_drop"] <= MAX_DROP,
                               "drop_le_floor_0.03": entry["auroc_drop"] <= FLOOR_DROP,
                               "size_le_15mb": entry["size_mb"] <= MAX_MB}
        report["formats"][name] = entry
    (out / "export_report.json").write_text(json.dumps(report, indent=2))
    log(json.dumps(report, indent=2))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description="Export one run to ONNX and static int8.")
    ap.add_argument("--run", required=True)
    ap.add_argument("--data", required=True)
    a = ap.parse_args(argv)
    export_run(a.run, a.data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
