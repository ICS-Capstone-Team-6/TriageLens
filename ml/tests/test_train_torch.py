"""Smoke tests for the PyTorch parts of ml/train (story E2-01).

Skipped when torch or timm is not installed, as in the light CI job. Run them where
ml/requirements-train.txt is installed. Random weights and synthetic images only, so no
download and no real data.
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

HAS_TORCH = all(importlib.util.find_spec(m) for m in ("torch", "timm", "torchvision", "sklearn", "matplotlib"))

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))
sys.path.insert(0, str(Path(__file__).resolve().parent))


@unittest.skipUnless(HAS_TORCH, "ml/requirements-train.txt not installed")
class TestModel(unittest.TestCase):
    def test_both_backbones_give_one_logit_and_a_feature_map(self):
        import torch

        from models import BACKBONES, TBNet

        for name in BACKBONES:
            model = TBNet(name, pretrained=False).eval()
            with torch.no_grad():
                logit, fmap = model(torch.zeros(2, 3, 320, 320), return_features=True)
                cam = model.cam(fmap)
            self.assertEqual(tuple(logit.shape), (2,), name)  # ADR-14: TB only
            self.assertEqual(fmap.shape[0], 2)
            self.assertEqual(tuple(cam.shape), (2, fmap.shape[2], fmap.shape[3]))

    def test_cam_matches_logit(self):
        # ADR-9: the mean of the CAM plus the bias equals the logit, with no gradients
        import torch

        from models import TBNet

        model = TBNet("mobilenetv3_large", pretrained=False).eval()
        with torch.no_grad():
            logit, fmap = model(torch.randn(1, 3, 320, 320), return_features=True)
            from_cam = model.cam(fmap).mean() + model.fc.bias[0]
        self.assertAlmostEqual(float(logit[0]), float(from_cam), places=4)

    def test_timm_can_download_pretrained_weights(self):
        # timm 1.0.11 silently loses its Hugging Face download path with huggingface_hub 2.x,
        # which broke the first Modal baselines run (rung 2). The pin must keep it working.
        import timm.models._hub as hub

        self.assertTrue(hub._has_hf_hub, "timm cannot import huggingface_hub: check the pin")
        self.assertTrue(hub._has_safetensors)

    def test_unknown_backbone_rejected(self):
        from models import TBNet

        with self.assertRaises(ValueError):
            TBNet("resnet50", pretrained=False)

    def test_border_mask_sets_padding_value(self):
        import torch

        from preprocess import normalize
        from train import mask_border

        x = torch.from_numpy(normalize(torch.full((1, 320, 320), 200, dtype=torch.uint8).numpy()))
        pad = torch.from_numpy(normalize(torch.zeros((1, 320, 320), dtype=torch.uint8).numpy()))
        masked = mask_border(x, 0.1)
        self.assertTrue(torch.allclose(masked[0, :, 0, 0], pad[0, :, 0, 0]))
        self.assertTrue(torch.equal(masked[0, :, 160, 160], x[0, :, 160, 160]))


@unittest.skipUnless(HAS_TORCH, "ml/requirements-train.txt not installed")
class TestTrainingRun(unittest.TestCase):
    def test_test_split_is_locked(self):
        from data import LockedSplitError, load_split

        with self.assertRaises(LockedSplitError):
            load_split("anywhere", "test")

    def test_short_run_writes_every_record(self):
        import prepare_data
        from test_train_core import make_raw
        from train import Config, run

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_raw(root / "raw", n=40)
            prepare_data.prepare(root / "raw", manifest, root / "data", workers=1)
            cfg = Config(pretrained=False, epochs_head=1, epochs_max=2, patience=5,
                         batch_size=8, num_workers=0)
            run_dir, m = run(cfg, root / "data", root / "runs", git_commit="test", log=lambda *_: None)
            for f in ("config.json", "history.csv", "metrics.json", "val_predictions.csv", "best.pt",
                      "curves.png"):
                self.assertTrue((run_dir / f).exists(), f)
            config = json.loads((run_dir / "config.json").read_text())
            for key in ("seed", "git_commit", "dataset_version_hash", "preprocess_spec"):
                self.assertIn(key, config)  # Team Rules 7: every run logs these
            self.assertEqual(m["epochs_run"], 3)
            self.assertIn("val_auroc_masked", m["shortcut_check"])
            # over- and underfitting evidence: clean train AUROC beside validation, per epoch
            import pandas as pd
            history = pd.read_csv(run_dir / "history.csv")
            for col in ("train_loss_aug", "train_loss_clean", "train_auroc_clean", "val_loss", "val_auroc"):
                self.assertIn(col, history.columns)
            self.assertAlmostEqual(m["fit"]["gap"], m["fit"]["train_auroc_clean"] - m["fit"]["val_auroc"])

            # the bake-off figure from several runs
            from plot_curves import plot_bakeoff
            run_dir2, _ = run(Config(pretrained=False, epochs_head=1, epochs_max=1, batch_size=8,
                                     num_workers=0, seed=2), root / "data", root / "runs",
                              log=lambda *_: None)
            out = plot_bakeoff([run_dir, run_dir2], root / "bakeoff.png")
            self.assertGreater(out.stat().st_size, 10_000)

    def test_baselines_rungs_0_and_1(self):
        import baselines
        import prepare_data
        from test_train_core import make_raw

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            manifest = make_raw(root / "raw", n=60)
            prepare_data.prepare(root / "raw", manifest, root / "data", workers=1)
            report = baselines.run(root / "data", root / "out", backbones=())
            self.assertEqual(set(report["results"]), {"rung0_image_size_only", "rung1_pixels_64"})
            self.assertTrue((root / "out" / "baselines.json").exists())


if __name__ == "__main__":
    unittest.main()
