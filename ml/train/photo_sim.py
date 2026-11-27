"""Phone-photo simulation for chest X-rays (story E7-01; TRD 9.7, ML-ROBUST-01).

Health workers photograph films on a light box or a screen (TRD 6.3). These functions
make a clean digital X-ray look like such a photo, so E7-02 can train on simulated
photos and test how much a model loses on them.

Effects: uneven light, glare, moire, tilt (perspective), cropping, blur, JPEG compression.

Every effect has the same form, ``effect(img, rng, strength)``:
- ``img`` is an 8-bit grayscale array (H, W), the form the pipeline works in (cxr-pre-2).
- ``rng`` is a ``numpy.random.Generator``. The same seed gives the same output.
- ``strength`` runs from 0 (no change, the input comes back as a copy) to 1 (strongest).
  The output always has the input's shape and dtype. The input is never changed.

The strength ranges are first guesses, not fitted to real photos. Check them against the
team photo set (E1-05) before E7-02 uses them, and record any change.

numpy and Pillow only, so the light CI job runs the tests (ml/requirements.txt).

Sample sheet for team review (synthetic phantom unless --image is given; never commit a
sheet made from a real dataset image):
    python3 ml/train/photo_sim.py --sheet docs/figures/photo-sim-samples.png
"""

import argparse
import io

import numpy as np
from PIL import Image, ImageFilter


def _check(img, strength):
    if not isinstance(img, np.ndarray) or img.dtype != np.uint8 or img.ndim != 2:
        raise ValueError("img must be a 2-D uint8 array (8-bit grayscale)")
    if not 0.0 <= strength <= 1.0:
        raise ValueError("strength must be between 0 and 1")


def _to_u8(x):
    return np.clip(np.rint(x), 0, 255).astype(np.uint8)


def _grid(h, w):
    """Pixel coordinates scaled to -1..1 on both axes."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    return 2 * x / max(w - 1, 1) - 1, 2 * y / max(h - 1, 1) - 1


def uneven_light(img, rng, strength=1.0):
    """Light box or room light brighter on one side: a smooth gain from a tilted ramp plus a vignette.

    At strength 1 the gain spans up to about 0.55 to 1.15 across the image.
    """
    _check(img, strength)
    if strength == 0:
        return img.copy()
    h, w = img.shape
    x, y = _grid(h, w)
    angle = rng.uniform(0, 2 * np.pi)
    ramp = np.cos(angle) * x + np.sin(angle) * y  # -1.4..1.4
    slope = strength * rng.uniform(0.1, 0.25)
    cx, cy = rng.uniform(-0.5, 0.5, 2)
    vignette = strength * rng.uniform(0.05, 0.2) * ((x - cx) ** 2 + (y - cy) ** 2)
    gain = 1 + slope * ramp - vignette
    return _to_u8(img.astype(np.float32) * gain)


def glare(img, rng, strength=1.0):
    """Reflection of a lamp or window: one or two bright soft spots that wash out detail."""
    _check(img, strength)
    if strength == 0:
        return img.copy()
    h, w = img.shape
    x, y = _grid(h, w)
    out = img.astype(np.float32)
    for _ in range(int(rng.integers(1, 3))):
        cx, cy = rng.uniform(-0.8, 0.8, 2)
        sx, sy = rng.uniform(0.08, 0.3, 2)
        spot = np.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) / 2)
        peak = strength * rng.uniform(0.5, 1.0)
        out = out + (255 - out) * peak * spot  # pulls towards white, never past it
    return _to_u8(out)


def moire(img, rng, strength=1.0):
    """Interference stripes from photographing a screen: two fine gratings that beat.

    The amplitude is at most about 14 grey levels at strength 1.
    """
    _check(img, strength)
    if strength == 0:
        return img.copy()
    h, w = img.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    pattern = np.zeros((h, w), np.float32)
    base_angle = rng.uniform(0, np.pi)
    for k in range(2):
        f = rng.uniform(0.15, 0.45)  # cycles per pixel, near the sampling limit
        a = base_angle + k * rng.uniform(0.02, 0.15)
        pattern += np.sin(2 * np.pi * f * (np.cos(a) * x + np.sin(a) * y) + rng.uniform(0, 2 * np.pi))
    amp = strength * rng.uniform(4, 7)
    return _to_u8(img.astype(np.float32) + amp * pattern)


def _perspective_coeffs(dst, src):
    """Pillow PERSPECTIVE coefficients that map output corners (dst) to input corners (src)."""
    rows, rhs = [], []
    for (u, v), (x, y) in zip(dst, src):
        rows.append([u, v, 1, 0, 0, 0, -x * u, -x * v])
        rows.append([0, 0, 0, u, v, 1, -y * u, -y * v])
        rhs += [x, y]
    return np.linalg.solve(np.array(rows, float), np.array(rhs, float)).tolist()


def tilt(img, rng, strength=1.0):
    """Phone not parallel to the film: a perspective warp, with light box or dark room showing at the edges.

    Each corner moves inwards by up to 12% of the side at strength 1. The surround is
    either dark (room) or bright (light box), chosen at random so it cannot track the label.
    """
    _check(img, strength)
    if strength == 0:
        return img.copy()
    h, w = img.shape
    m = 0.12 * strength
    corners = [(0, 0), (w, 0), (w, h), (0, h)]
    inward = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    dst = [(cx + sx * rng.uniform(0, m) * w, cy + sy * rng.uniform(0, m) * h)
           for (cx, cy), (sx, sy) in zip(corners, inward)]
    fill = int(rng.integers(0, 40)) if rng.random() < 0.5 else int(rng.integers(200, 256))
    warped = Image.fromarray(img).transform(
        (w, h), Image.Transform.PERSPECTIVE, _perspective_coeffs(dst, corners),
        Image.Resampling.BILINEAR, fillcolor=fill)
    return np.asarray(warped).copy()


def crop(img, rng, strength=1.0):
    """Film not centred in the frame: cut up to 12% from each side at strength 1, then resize back.

    The sides are cut independently, so the aspect ratio changes at random (as in
    data.aspect_jitter); it carries no label information (ADR-16).
    """
    _check(img, strength)
    if strength == 0:
        return img.copy()
    h, w = img.shape
    m = 0.12 * strength
    left, right = (int(rng.uniform(0, m) * w) for _ in range(2))
    top, bottom = (int(rng.uniform(0, m) * h) for _ in range(2))
    part = img[top:h - bottom, left:w - right]
    return np.asarray(Image.fromarray(part).resize((w, h), Image.Resampling.BILINEAR)).copy()


def blur(img, rng, strength=1.0):
    """Out of focus or a shaking hand: Gaussian blur or a short straight motion streak.

    At strength 1 the Gaussian radius is up to 3 px and the streak up to 9 px, at 320 px wide.
    Sizes scale with image width. A streak is never shorter than 3 px.
    """
    _check(img, strength)
    if strength == 0:
        return img.copy()
    scale = img.shape[1] / 320
    if rng.random() < 0.5:
        radius = strength * rng.uniform(1.0, 3.0) * scale
        return np.asarray(Image.fromarray(img).filter(ImageFilter.GaussianBlur(radius))).copy()
    length = max(3, int(round(strength * rng.uniform(3, 9) * scale)))
    angle = rng.uniform(0, np.pi)
    padded = np.pad(img, length, mode="edge")  # edges repeated, so no dark rim
    acc = np.zeros(img.shape, np.float32)
    for k in range(length):  # average of copies shifted along the streak, centred on the pixel
        s = k - (length - 1) / 2
        # floor(x + 0.5), not round(): Python rounds 0.5 and -0.5 both to 0, which would
        # collapse a 2-step streak into no shift at all
        dx, dy = int(np.floor(s * np.cos(angle) + 0.5)), int(np.floor(s * np.sin(angle) + 0.5))
        acc += np.roll(padded, (dy, dx), axis=(0, 1))[length:-length, length:-length]
    return _to_u8(acc / length)


def jpeg(img, rng, strength=1.0):
    """Messaging-app or camera compression: JPEG quality near 95 at low strength, 30 to 40 at strength 1."""
    _check(img, strength)
    if strength == 0:
        return img.copy()
    top = 95 - 55 * strength
    quality = int(round(rng.uniform(top - 10, top)))
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format="JPEG", quality=quality)
    return np.asarray(Image.open(buf).convert("L")).copy()


# Physical order: light and reflections on the film, the screen pattern, then the camera
# (angle, framing, focus) and last the file compression.
EFFECTS = {
    "uneven_light": uneven_light,
    "glare": glare,
    "moire": moire,
    "tilt": tilt,
    "crop": crop,
    "blur": blur,
    "jpeg": jpeg,
}


class PhotoSim:
    """Random mix of effects for training (E7-02).

    Each effect runs with probability ``p[name]`` (default 0.5) at a strength drawn
    uniformly from 0 to ``max_strength``.

        sim = PhotoSim(seed=1)
        photo_like = sim(img)
    """

    def __init__(self, p=None, max_strength=1.0, seed=None):
        self.p = {name: 0.5 for name in EFFECTS}
        if p:
            unknown = set(p) - set(EFFECTS)
            if unknown:
                raise ValueError(f"unknown effects: {sorted(unknown)}")
            self.p.update(p)
        if not 0.0 <= max_strength <= 1.0:
            raise ValueError("max_strength must be between 0 and 1")
        self.max_strength = max_strength
        self.rng = np.random.default_rng(seed)

    def __call__(self, img):
        _check(img, 0.0)
        out = img.copy()
        for name, effect in EFFECTS.items():
            if self.rng.random() < self.p[name]:
                out = effect(out, self.rng, self.rng.uniform(0, self.max_strength))
        return out


def phantom(size=320):
    """Synthetic chest-like test image: no real patient data (Team Rules 8)."""
    x, y = _grid(size, size)
    img = 190 - 40 * (x ** 2)  # soft tissue, darker at the sides
    for cx in (-0.42, 0.42):  # two lung fields
        lung = ((x - cx) / 0.32) ** 2 + ((y + 0.05) / 0.62) ** 2 < 1
        img = np.where(lung, 70 + 25 * (y + 1), img)
    ribs = (np.sin(18 * (y - 0.15 * x ** 2)) > 0.85) & (np.abs(x) < 0.8)
    img = np.where(ribs, img + 35, img)
    img = np.where(np.abs(x) < 0.08, 215, img)  # spine
    return _to_u8(img)


def sample_sheet(img, path, seed=0, levels=(0.33, 0.66, 1.0)):
    """One row per effect, one column per strength (plus the clean image), saved as PNG."""
    h, w = img.shape
    rows = []
    for k, (name, effect) in enumerate(EFFECTS.items()):
        tiles = [img] + [effect(img, np.random.default_rng(seed + k), s) for s in levels]
        rows.append(np.hstack(tiles))
    mixed = [PhotoSim(seed=seed + i)(img) for i in range(len(levels) + 1)]
    rows.append(np.hstack(mixed))
    Image.fromarray(np.vstack(rows)).save(path)
    return [*EFFECTS, "PhotoSim mix"]


def main():
    ap = argparse.ArgumentParser(description="Render a phone-photo simulation sample sheet (E7-01).")
    ap.add_argument("--sheet", required=True, help="output PNG path")
    ap.add_argument("--image", help="grayscale image to use instead of the synthetic phantom")
    ap.add_argument("--size", type=int, default=320)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    if a.image:
        src = np.asarray(Image.open(a.image).convert("L").resize((a.size, a.size), Image.Resampling.BILINEAR))
    else:
        src = phantom(a.size)
    names = sample_sheet(src, a.sheet, seed=a.seed)
    print(f"wrote {a.sheet}: rows {', '.join(names)}; columns clean, 0.33, 0.66, 1.0 (mix row: 4 random draws)")


if __name__ == "__main__":
    main()
