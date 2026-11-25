"""Tests for the CAM head file the app uses to draw the heatmap (ADR-9; E10-07).

Skipped without torch and timm. Random weights only: no download and no real data.
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

HAS_DEPS = all(importlib.util.find_spec(m) for m in ("torch", "timm"))

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "export"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))


@unittest.skipUnless(HAS_DEPS, "ml/requirements-train.txt not installed")
class TestCamHead(unittest.TestCase):
    def test_head_rebuilds_the_models_cam_and_logit(self):
        import numpy as np
        import torch

        import write_cam_head
        from models import BACKBONES, TBNet

        for name in BACKBONES:
            model = TBNet(name, pretrained=False).eval()
            head = write_cam_head.cam_head(model, "fake-run", "AB" * 32)
            with torch.no_grad():
                logit, fmap = model(torch.randn(1, 3, 320, 320), return_features=True)
                ref_cam = model.cam(fmap)[0].numpy()
            f = fmap[0].numpy()
            self.assertEqual(head["channels"], f.shape[0], name)
            cam = np.einsum("chw,c->hw", f, np.asarray(head["weight"], np.float32))
            np.testing.assert_allclose(cam, ref_cam, atol=1e-4, err_msg=name)
            # The same numbers give back the logit: mean of the CAM plus the bias.
            self.assertAlmostEqual(float(cam.mean() + head["bias"]), float(logit[0]), places=3)
            self.assertEqual(head["model_sha256"], "ab" * 32)

    def test_main_writes_the_file_bound_to_the_model_hash(self):
        import torch

        import write_cam_head
        from models import TBNet

        with tempfile.TemporaryDirectory() as d:
            run = Path(d) / "fake-run"
            run.mkdir()
            (run / "config.json").write_text(json.dumps({"backbone": "efficientnet_lite0"}))
            torch.save(TBNet("efficientnet_lite0", pretrained=False).state_dict(), run / "best.pt")
            model_file = Path(d) / "model.onnx"
            model_file.write_bytes(b"fake model bytes")
            out = Path(d) / "cam_head.json"
            write_cam_head.main(["--run", str(run), "--model", str(model_file), "--out", str(out)])
            head = json.loads(out.read_text())
            self.assertEqual(head["run_id"], "fake-run")
            self.assertEqual(head["model_sha256"], write_cam_head.sha256_file(model_file))
            self.assertEqual(len(head["weight"]), head["channels"])


if __name__ == "__main__":
    unittest.main()
