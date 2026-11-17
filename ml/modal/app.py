"""Modal app for TriageLens GPU work (ADR-13, story E2-01).

Run a GPU smoke test:

    modal run ml/modal/app.py

Datasets live in the `triagelens-data` volume and runs in `triagelens-runs`.
Neither is ever committed (TRD 9.2). Training entry points are added here by
E2-01 onward; the training code itself stays plain Python under ml/.
"""

import modal

APP_NAME = "triagelens"
DATA_VOLUME = "triagelens-data"
RUNS_VOLUME = "triagelens-runs"
DATA_DIR = "/data"
RUNS_DIR = "/runs"
GPU = "T4"  # cheapest Modal GPU; enough for MobileNet-sized backbones (ADR-3)

# Python 3.11 matches CI. Pins per Team Rules 6.
image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch==2.5.1",
    "numpy==2.2.6",  # same pin as ml/requirements.txt
)

data_volume = modal.Volume.from_name(DATA_VOLUME, create_if_missing=True)
runs_volume = modal.Volume.from_name(RUNS_VOLUME, create_if_missing=True)

app = modal.App(APP_NAME, image=image)


@app.function(
    gpu=GPU,
    timeout=10 * 60,
    volumes={DATA_DIR: data_volume, RUNS_DIR: runs_volume},
)
def smoke() -> dict:
    """Check the GPU is visible to torch and both volumes are mounted."""
    import os

    import torch

    result = {
        "torch": str(torch.__version__),  # TorchVersion would need torch to unpickle locally
        "cuda_available": torch.cuda.is_available(),
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "data_entries": sorted(os.listdir(DATA_DIR)),
        "runs_entries": sorted(os.listdir(RUNS_DIR)),
    }
    if result["cuda_available"]:
        x = torch.randn(1024, 1024, device="cuda")
        result["matmul_ok"] = bool(torch.isfinite(x @ x).all().item())
    return result


@app.local_entrypoint()
def main() -> None:
    result = smoke.remote()
    for key, value in result.items():
        print(f"{key}: {value}")
    if not result["cuda_available"]:
        raise SystemExit("No GPU visible to torch.")
