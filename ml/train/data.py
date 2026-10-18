"""Load the prepared arrays and feed them to training (story E2-01).

The test split is locked (ML-DATA-04): load_split refuses it unless the caller passes
allow_test=True, which only the frozen-model evaluation does.
"""

import io
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset
from torchvision.transforms import v2

sys.path.insert(0, str(Path(__file__).resolve().parent))
from preprocess import load_spec, normalize  # noqa: E402


class LockedSplitError(Exception):
    """Something asked for the test split outside a frozen-model evaluation."""


def load_split(data_dir, split, allow_test=False):
    if split == "test" and not allow_test:
        raise LockedSplitError("the test split is locked until a model is frozen (ML-DATA-04)")
    with np.load(Path(data_dir) / f"{split}.npz") as z:
        return {k: z[k] for k in z.files}


class Augment:
    """TRD 9.4 augmentation for chest X-rays. No horizontal flip: anatomy is not symmetric."""

    # Randomness comes from torch's generator only: the DataLoader seeds it per worker
    # from the run seed, so runs repeat and workers do not share one sequence.

    def __init__(self):
        self.geometric = v2.RandomAffine(degrees=10, scale=(0.9, 1.1))
        self.photometric = v2.ColorJitter(brightness=0.2, contrast=0.2)

    def __call__(self, u8):
        t = torch.from_numpy(u8)[None]  # (1, H, W) uint8
        t = self.photometric(self.geometric(t))
        img = t[0].numpy()
        if torch.rand(1).item() < 0.5:  # JPEG compression, quality 50 to 95
            buf = io.BytesIO()
            Image.fromarray(img).save(buf, format="JPEG", quality=int(torch.randint(50, 96, (1,)).item()))
            img = np.asarray(Image.open(buf).convert("L"))
        if torch.rand(1).item() < 0.5:  # mild sensor noise
            noise = torch.randn(img.shape).numpy() * 4
            img = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)
        return img


class XrayDataset(Dataset):
    def __init__(self, split_arrays, augment=None):
        self.x, self.y = split_arrays["x"], split_arrays["y"]
        self.augment = augment
        self.spec = load_spec()

    def __len__(self):
        return len(self.y)

    def __getitem__(self, i):
        img = self.x[i]
        if self.augment is not None:
            img = self.augment(img)
        return torch.from_numpy(normalize(img, self.spec)), torch.tensor(float(self.y[i]))
