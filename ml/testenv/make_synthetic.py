"""Generate a synthetic stand-in for the Shenzhen set, for adversarial testing.

Story E1-03 (Prosit 2 Section D test environment). The real Shenzhen images may not
be shared outside our research group (NLM terms), so the paired team attacks this
synthetic copy instead. It has the same layout, file names and reading formats,
including the messy formats found in the real readings. The images are random
textures, not X-rays: they test the data path, not the model.

Usage (from the repo root):
    python3 ml/testenv/make_synthetic.py            # writes ml/data/testenv/raw/
    python3 ml/pipeline/build_dataset.py --raw ml/data/testenv/raw \
        --out ml/data/testenv/out --private ml/data/testenv/private
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SEED = 2026
N_PATIENTS = 400
TB_RATE = 0.52
CHILD_RATE = 0.04
SIZE = 640  # above the pipeline's 512 px minimum

# Header formats seen in the real readings (B2 of the Prosit 2 report)
HEADERS = ["{sex} {age}yrs", "{sex} {age}yrs  \t", "{Sex} , {age}yrs  \t", "{sex}, {age}yrs",
           "{sex}{age}yrs", "{sex} {age}yr", "{sexfem} {age}yrs"]
TB_FINDINGS = ["bilateral PTB", "right PTB", "left PTB", "PTB in the right upper field",
               "PTB in the left upper field", "secondary PTB  in the right upper field \t"]


def texture(rng, size=SIZE):
    """Smooth random texture: a 40x40 grid upsampled, so each image is distinct but small."""
    base = rng.integers(0, 256, (40, 40), dtype=np.uint8)
    return Image.fromarray(base).resize((size, size), Image.BICUBIC)


def reading(rng, label, age):
    sex = "female" if rng.random() < 0.33 else "male"
    fmt = HEADERS[rng.integers(len(HEADERS))]
    if "{sexfem}" in fmt and sex == "male":
        fmt = HEADERS[0]
    head = fmt.format(sex=sex, Sex=sex.capitalize(), sexfem="femal", age=age)
    finding = TB_FINDINGS[rng.integers(len(TB_FINDINGS))] if label else "normal"
    return f"{head}\r\n{finding}"


def generate(out, n=N_PATIENTS, seed=SEED):
    rng = np.random.default_rng(seed)
    img_dir, rd_dir = out / "CXR_png", out / "ClinicalReadings"
    img_dir.mkdir(parents=True, exist_ok=True)
    rd_dir.mkdir(parents=True, exist_ok=True)
    for i in range(1, n + 1):
        label = int(rng.random() < TB_RATE)
        age = int(rng.integers(3, 15)) if rng.random() < CHILD_RATE else int(rng.integers(15, 81))
        name = f"CHNCXR_{i:04d}_{label}"
        texture(rng).save(img_dir / f"{name}.png")
        (rd_dir / f"{name}.txt").write_text(reading(rng, label, age))
    (out / "SYNTHETIC_README.txt").write_text(
        "Synthetic test data for TriageLens adversarial pass 2. Not real patients. "
        f"Seed {seed}, {n} records.\n")
    return n


def main(argv=None):
    ap = argparse.ArgumentParser(description="Generate the synthetic Shenzhen-format test set.")
    ap.add_argument("--out", default="ml/data/testenv/raw")
    ap.add_argument("--n", type=int, default=N_PATIENTS)
    ap.add_argument("--seed", type=int, default=SEED)
    a = ap.parse_args(argv)
    n = generate(Path(a.out), a.n, a.seed)
    print(f"Wrote {n} synthetic records to {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
