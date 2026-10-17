# Synthetic test environment (adversarial pass 2)

A synthetic stand-in for the Shenzhen TB set, for our paired team's attacks on the data path (ICS 591 Prosit 2, Section D). Story `E1-03`.

The real images may not be shared outside our research group (NLM terms of use), so the test environment is synthetic. It has the same folder layout, file names and reading formats as the real set, including the messy reading formats we found. The images are random textures, not X-rays. They test the data path, not the model.

## Run it

From the repo root, in your own fork:

```bash
pip install -r ml/requirements.txt
python3 ml/testenv/make_synthetic.py
python3 ml/pipeline/build_dataset.py --raw ml/data/testenv/raw --out ml/data/testenv/out --private ml/data/testenv/private
```

The generator writes 400 records (seed 2026) to `ml/data/testenv/raw/`, which Git ignores. Run the pipeline once on the clean set and record the `dataset_version_hash` it prints. That is your baseline. PNG bytes can differ across machines, so compare against your own baseline.

## Attack it

Change anything under `ml/data/testenv/raw/` (images, file names, readings), or the pipeline code in your fork. Run the pipeline again and compare `manifest.csv`, `quarantine.csv` and `run_report.json` with your baseline. `ml/tests/test_testenv.py` shows one worked example: a flipped label that the label check catches.

Scope and rules: see the data path and test environment document shared with your team.
