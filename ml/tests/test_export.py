"""Tests for ONNX export and static int8 quantization (story E5-02).

Skipped when torch, timm, onnx or onnxruntime is not installed, as in the light CI job.
Random weights and synthetic images only: no download and no real data.
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

NEEDS = ("torch", "timm", "torchvision", "sklearn", "matplotlib", "onnx", "onnxruntime")
HAS_DEPS = all(importlib.util.find_spec(m) for m in NEEDS)

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "export"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))
sys.path.insert(0, str(Path(__file__).resolve().parent))


@unittest.skipUnless(HAS_DEPS, "ml/requirements-train.txt not installed")
class TestExport(unittest.TestCase):
    def test_fp32_onnx_matches_pytorch_for_both_backbones(self):
        import numpy as np
        import torch

        import export_onnx
        from models import BACKBONES, TBNet

        rng = np.random.default_rng(0)
        x = rng.integers(0, 256, (2, 320, 320), dtype=np.uint8)
        with tempfile.TemporaryDirectory() as d:
            for name in BACKBONES:
                model = TBNet(name, pretrained=False).eval()
                path = export_onnx.export_fp32(model, Path(d) / f"{name}.onnx")
                logit, feats = export_onnx.run_onnx(path, x)
                with torch.no_grad():
                    ref, ref_feats = model(torch.from_numpy(export_onnx.normalize(x)), return_features=True)
                self.assertEqual(logit.shape, (2,), name)  # one TB logit per image (ADR-14)
                self.assertEqual(feats.shape, tuple(ref_feats.shape), name)  # CAM input (ADR-9)
                np.testing.assert_allclose(logit, ref.numpy(), atol=1e-3, err_msg=name)
                self.assertFalse(model.training, name)  # export must not switch BatchNorm to train mode

    def test_calibration_set_is_fixed_and_from_the_given_images(self):
        import numpy as np

        import export_onnx

        x = np.arange(500)[:, None, None].astype(np.uint8) * np.ones((1, 4, 4), np.uint8)
        a, b = export_onnx.calibration_images(x, n=50), export_onnx.calibration_images(x, n=50)
        self.assertEqual(len(a), 50)
        np.testing.assert_array_equal(a, b)  # same images every run

    def test_full_run_writes_three_models_and_a_report(self):
        import prepare_data
        from test_train_core import make_raw
        from train import Config, run

        import export_onnx

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_raw(root / "raw", n=40)
            prepare_data.prepare(root / "raw", manifest, root / "data", workers=1)
            cfg = Config(pretrained=False, epochs_head=1, epochs_max=1, batch_size=8, num_workers=0)
            run_dir, _ = run(cfg, root / "data", root / "runs", log=lambda *_: None)
            report = export_onnx.export_run(run_dir, root / "data", log=lambda *_: None)

            for f in ("fp32.onnx", "int8_qdq.onnx", "int8_qop.onnx", "export_report.json"):
                self.assertTrue((run_dir / "onnx" / f).exists(), f)
            self.assertFalse(list((run_dir / "onnx").glob("*.prep.onnx")))  # temp files removed
            saved = json.loads((run_dir / "onnx" / "export_report.json").read_text())
            self.assertEqual(saved["calibration"]["split"], "train")  # never the evaluation set
            self.assertLess(report["parity_fp32_max_abs_logit"], 1e-3)
            self.assertIn("float_ops", report["formats"]["int8_qop"]["ops"])
            fp32_mb = report["formats"]["fp32"]["size_mb"]
            for fmt in ("int8_qdq", "int8_qop"):
                entry = report["formats"][fmt]
                self.assertLess(entry["size_mb"], fp32_mb * 0.5, fmt)  # int8 is about a quarter
                for key in ("auroc_drop", "auroc_drop_ci95", "cam_corr_with_fp32", "passes"):
                    self.assertIn(key, entry)

    def test_refuses_a_run_from_another_preprocessing_version(self):
        import export_onnx

        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "config.json").write_text(json.dumps(
                {"backbone": "mobilenetv3_large", "seed": 1, "preprocess_spec": "cxr-pre-1"}))
            with self.assertRaises(ValueError):
                export_onnx.export_run(d, d, log=lambda *_: None)


if __name__ == "__main__":
    unittest.main()
