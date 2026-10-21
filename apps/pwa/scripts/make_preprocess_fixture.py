"""Write the Pillow reference fixture for the app's cxr-pre-2 parity test.

The app must reproduce ml/train/preprocess.py exactly (preprocess_spec.json, ADR-16):
8-bit grayscale (PIL 'L'), then a straight bilinear resize to 320 x 320. This script
runs those same Pillow calls on synthetic images (no patient data) and saves the
inputs and outputs, so `src/lib/preprocess.test.ts` can check the TypeScript port
byte for byte.

Run from apps/pwa:  python3 scripts/make_preprocess_fixture.py
"""
import json
from pathlib import Path

import numpy as np
import PIL
from PIL import Image

SIZE = 320
OUT = Path(__file__).resolve().parent.parent / "test" / "fixtures"


def synthetic_rgb(w, h, seed):
    """Smooth gradients, rings and noise: enough structure to expose filter differences."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    base = 128 + 90 * np.sin(x / 17.0) * np.cos(y / 23.0)
    rings = 40 * np.sin(np.hypot(x - w / 2, y - h / 2) / 9.0)
    noise = rng.normal(0, 18, (h, w))
    g = np.clip(base + rings + noise, 0, 255)
    rgb = np.stack([g, np.clip(g * 0.9 + 20, 0, 255), np.clip(255 - g * 0.7, 0, 255)], axis=-1)
    return rgb.astype(np.uint8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cases = []
    # Downscale (the usual case), a non-square downscale, and an upscale.
    for name, (w, h, seed) in {"down": (641, 557, 1), "tall": (301, 797, 2), "up": (211, 157, 3)}.items():
        rgb = synthetic_rgb(w, h, seed)
        gray = Image.fromarray(rgb).convert("L")
        out = gray.resize((SIZE, SIZE), Image.BILINEAR)
        if name == "up":  # keep the RGB input small; one case is enough for the luma check
            (OUT / f"pre_{name}_rgb.u8").write_bytes(rgb.tobytes())
        (OUT / f"pre_{name}_gray.u8").write_bytes(np.asarray(gray, dtype=np.uint8).tobytes())
        (OUT / f"pre_{name}_out.u8").write_bytes(np.asarray(out, dtype=np.uint8).tobytes())
        cases.append({"name": name, "width": w, "height": h, "rgb": name == "up"})
    meta = {"pillow": PIL.__version__, "size": SIZE, "spec": "cxr-pre-2", "cases": cases}
    (OUT / "preprocess_fixture.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
