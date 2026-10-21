"""Reference preprocessing for the chest X-ray TB model (TRD 9.3, 10.6; story E2-01).

The steps are defined in preprocess_spec.json. Training, evaluation, ONNX parity tests
and the app all follow that file, so training and serving see the same input.
Only numpy and Pillow are needed, so CI can test this without PyTorch.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

SPEC_PATH = Path(__file__).with_name("preprocess_spec.json")


def load_spec(path=SPEC_PATH):
    return json.loads(Path(path).read_text())


def to_model_size(img, spec=None):
    """Grayscale, then resize straight to input_size x input_size (ADR-16).

    The aspect ratio is not kept and nothing is padded: padding bars encoded image
    shape, and shape predicts the label in the Shenzhen set. Returns uint8 (size, size).
    """
    spec = spec or load_spec()
    size = spec["input_size"]
    return np.asarray(img.convert("L").resize((size, size), Image.BILINEAR), dtype=np.uint8)


def normalize(u8, spec=None):
    """uint8 (H, W) or (N, H, W) -> float32 (3, H, W) or (N, 3, H, W), normalised."""
    spec = spec or load_spec()
    x = u8.astype(np.float32) / 255.0
    mean = np.asarray(spec["mean"], dtype=np.float32)
    std = np.asarray(spec["std"], dtype=np.float32)
    if x.ndim == 2:
        x = np.repeat(x[None], 3, axis=0)
        return (x - mean[:, None, None]) / std[:, None, None]
    x = np.repeat(x[:, None], 3, axis=1)
    return (x - mean[None, :, None, None]) / std[None, :, None, None]


def preprocess_file(path, spec=None):
    """Full reference path for one image file: float32 (1, 3, size, size)."""
    spec = spec or load_spec()
    with Image.open(path) as im:
        return normalize(to_model_size(im, spec), spec)[None]
