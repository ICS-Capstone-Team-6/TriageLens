# Data card: TBX11K TB chest X-ray set, version 1 (training source)

Story `E1-03`. Built by `ml/pipeline/build_tbx11k.py` (pipeline 0.1.0). Decisions: [ADR-23](../../../docs/adr/0023-tbx11k-without-age-or-patient-ids.md).

**Status: draft.** The pipeline hasn't been run on the real download yet. The counts below come from the official README. Replace them with the numbers from `run_report.json` after the first run, and add the dataset version hash.

## Source and licence

| Field | Value |
| --- | --- |
| Name | TBX11K |
| Provider | Media Computing Lab, Nankai University, with InferVision (Liu et al., CVPR 2020; journal version arXiv 2307.02848) |
| Images from | Authors' official archive, linked from [github.com/yun-liu/Tuberculosis](https://github.com/yun-liu/Tuberculosis). Downloaded by Chelsea into git-ignored `ml/data/raw/tbx11k/`. Date and archive SHA-256: to add. |
| Images | 512 by 512 PNG. The authors downsized them from about 3000 by 3000. |
| Labels | Class folder: `health` (healthy), `sick` (sick but not TB), `tb`. TB boxes in COCO annotations are active TB (category 1) or latent TB (category 2, "ObsoletePulmonaryTuberculosis"). |
| Our label | `health` and `sick` = 0; `tb` = 1, **including latent-only TB** (ADR-23). The subtype is kept in the manifest column `tb_subtype`. |
| Terms of use | **Two statements disagree.** The project page (mmcheng.net/tb) says the dataset is under Creative Commons Attribution 4.0. The GitHub `LICENSE.md` says the code is under CC BY-NC-SA 4.0, non-commercial only. Our use is non-commercial research and we don't redistribute the data, so both allow it. Cite Liu et al. Still to do: check the README inside the archive and add a licence-register entry (`E1-01`). |
| Personal data | None supplied. No age, sex, patient ID or DICOM tags. |
| Role (TRD Appendix A) | Train, validate, internal test (TB) |

## Official counts (labelled part)

| Class | Train | Val |
| --- | --- | --- |
| Healthy | 3,000 | 800 |
| Sick, not TB | 3,000 | 800 |
| TB (active 473 + 157, latent 104 + 36, both 23 + 7) | 600 | 200 |
| Total | 6,600 | 1,800 |

The 2,800 official test images have no public labels (an online challenge), so we don't use them. The pipeline stops if the list files don't match these counts.

## How the split works

- Official train goes to `train`. Official val is split into `val` and `test`, half each, stratified by label, with seed 591.
- A near-duplicate group (256-bit dHash, 12 bits or less) that touches official train goes wholly to `train`.
- `source_split` and `source_class` in the manifest keep the original assignment.
- Images that match Shenzhen or Montgomery (SHA-256 or dHash) are quarantined. Montgomery is locked, and a Shenzhen copy could cross splits when the sets are combined.
- Only health, sick and tb images from the official train and val lists are read. Other folders in a copy (for example `extra/`) are quarantined. India DA and DB are our external test sets, so they must never come in this way.

## Known limits

- **No age (TRD 9.1 gap).** Children's films may be included. The app still gates on age at inference. See ADR-23 and hazard H4.
- **No patient IDs (ML-DATA-02 gap).** Two films of one patient can sit in different splits, so internal test numbers may be optimistic. Judge models on the locked external sets.
- **No sex or age subgroups** for `E6-03`. Report TBX11K as a missing group.
- **Low resolution.** At 512 px, the images sit exactly on our quality floor. Fine detail is gone, and the image size differs from Shenzhen and Montgomery. A model could learn the source from resolution or processing (H11), so run the shortcut check when the sources are combined.
- **Source and population.** The authors don't name the hospitals or countries on the pages we read. To confirm from the paper. No African patients are known (H4).
- **Class balance.** TB is about 9.5% of labelled images, against about 50% in Shenzhen. Mind the class weights and sampling when combining.
- **The overlap check is hash-based.** It finds copies and resized copies, not crops or re-processed versions of the same film.
