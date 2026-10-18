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


def aspect_jitter(u8, sx, sy):
    """Stretch width by sx and height by sy (both 1 or more), then centre-crop back.

    Changes the apparent aspect ratio without padding: it only enlarges, so no black
    bars appear (ADR-16). sx > sy makes the chest look wider, sy > sx narrower.
    """
    h, w = u8.shape
    nw, nh = max(w, round(w * sx)), max(h, round(h * sy))
    big = np.asarray(Image.fromarray(u8).resize((nw, nh), Image.BILINEAR))
    x0, y0 = (nw - w) // 2, (nh - h) // 2
    return big[y0:y0 + h, x0:x0 + w]


class Augment:
    """TRD 9.4 augmentation for chest X-rays. No horizontal flip: anatomy is not symmetric.

    shape_jitter (ADR-16 follow-up): in Shenzhen, narrow framing goes with TB, and the
    first bake-off scores still followed aspect ratio within each class (Spearman
    -0.26 to -0.53 across runs and classes).
    Random independent stretches of width and height, up to shape_jitter, make apparent
    chest width an unreliable clue. 0 turns it off (the bake-off 1 setting).
    """

    # Randomness comes from torch's generator only: the DataLoader seeds it per worker
    # from the run seed, so runs repeat and workers do not share one sequence.

    def __init__(self, shape_jitter=0.15):
        self.shape_jitter = shape_jitter
        self.geometric = v2.RandomAffine(degrees=10, scale=(0.9, 1.1))
        self.photometric = v2.ColorJitter(brightness=0.2, contrast=0.2)

    def __call__(self, u8):
        if self.shape_jitter > 0:
            sx, sy = (1 + self.shape_jitter * torch.rand(2)).tolist()
            u8 = aspect_jitter(u8, sx, sy)
        t = torch.from_numpy(np.ascontiguousarray(u8))[None]  # (1, H, W) uint8
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
