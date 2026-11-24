# Licence and usage register

Story `E1-01`. Owner: Micheal. Support: Chelsea (data facts), Kweku (ethics and agreements). Requirement: ML-DATA-01, NFR-PRIV. Sources: TRD Appendix A, TRD 9.2.

**Status: skeleton.** One row (Shenzhen) has been checked against a source. Every "To verify" cell is a gap, not a claim. Do not use this register to justify using a dataset until its row is filled in.

## What this register is for

ML-DATA-01 says every dataset has a data card and a licence entry before use. This register is that entry: for each dataset, what its terms allow, whether we can get it, and which part of the project it may feed. Nana Yaw's E1-02 (download and checksum) and Chelsea's E1-03 (splits and data cards) read from here.

TRD Appendix A points at this file: "Check each dataset's current licence and access terms before use (the licence register in E1-01 records this)."

## How to fill a row

1. Open the dataset's own page or terms. Do not rely on memory, a blog post, or another dataset's terms.
2. Write the licence or terms in plain words, plus the citation the provider asks for. Keep it short.
3. Record who checked it and when. A row without a date is a guess.
4. If a term is unclear, write "To verify" and note what you still need to ask. Never guess a licence (CLAUDE.md).
5. When a dataset needs a request, a registration or credentials, add a row to the access request log below and update it as the request moves.
6. Keep the allowed use in the project's own words: train, validate, internal test, locked external test, robustness test, gate training, none.

## Rules

- Never put credentials, access tokens, download links that carry tokens, or patient data in this file. Record that access was granted and the date, not the key.
- External test sets are locked (TRD 9.2). No training, tuning, early stopping or threshold work on them. Mark them "locked external test".
- The Kermany paediatric set is excluded (TRD 9.2) and must not appear in any training or test split.
- Datasets are never redistributed (TRD 9.2, ML-DATA-07). Do not copy one into the repo or into a shared folder.
- Some approvals are agreements made by the team or the university rather than by one person. Route those through Kweku (ethics) before signing anything.

## 1. Register

| Dataset | Type | Licence or terms | Access status | Allowed use | Handling notes | Checked (who, date) | Source |
|--------------------------------|------------------------|------------------|---------------|-----------------|----------------|-------------------|--------|
| TBX11K | Chest X-ray | To verify | Unknown | Train, validate, internal test (TB) | Check overlap with Shenzhen and Montgomery by hash and metadata (TRD Appendix A). | Not checked | To add |
| Shenzhen Hospital CXR Set | Chest X-ray | Do not share outside the research group. Report errors to NLM. Cite Jaeger et al. 2014 and Candemir et al. 2014. De-identified by the provider; NIH IRB exemption No. 5357. | Public. Downloaded 17 Oct 2026. | Train, validate (TB) | The text reading gives sex and age per image. Keep the images in git-ignored `ml/data/`. Data card v1 also assigns an internal test split; TRD Appendix A does not. Confirm which is right. | Chelsea, 17 Oct 2026 (data card v1) | [NLM file index](https://data.lhncbc.nlm.nih.gov/public/Tuberculosis-Chest-X-ray-Datasets/Shenzhen-Hospital-CXR-Set/index.html) |
| Montgomery County set | Chest X-ray | To verify | Unknown | Locked external test (TB) | US source. Lung masks available. | Not checked | To add |
| India TB sets (DA, DB) | Chest X-ray | To verify | Unknown | Locked external test (TB) | India source. Small. | Not checked | To add |
| RSNA Pneumonia Detection | Chest X-ray | To verify | Unknown | Train, validate, internal test (pneumonia) | Derived from NIH data. Adults. | Not checked | To add |
| VinDr-CXR | Chest X-ray | To verify | Unknown | Locked external test (pneumonia) | Vietnam source. About 18,000 images. | Not checked | To add |
| CheXphoto | Phone photos of chest X-rays | To verify. TRD Appendix A notes research terms apply. | Unknown | Robustness test | Stanford. Photos and transformations of CheXpert images. | Not checked | To add |
| CheXpert | Chest X-ray | To verify | Registration required (TRD Appendix A). Not requested. | Optional teacher pretraining | Optional. Not on the critical path. | Not checked | To add |
| JSRT with masks, Montgomery masks | Chest X-ray | To verify | Unknown | Optional lung segmentation (icebox E15-03) | Only if the icebox story is picked up. | Not checked | To add |
| Kermany paediatric set | Chest X-ray | Not applicable | Excluded (TRD 9.2) | None | Paediatric set with known label and shortcut problems. Must not appear in any split. | TRD 9.2 | TRD Appendix A |
| APTOS 2019 | Retinal | To verify | Unknown | Train, validate (DR) | India source. About 3,700 images. | Not checked | To add |
| EyePACS (Kaggle DR 2015) | Retinal | To verify. Check the competition terms (TRD Appendix A). | Unknown | Train, validate (DR) | Use about 20,000 of 88,000 images. | Not checked | To add |
| Messidor-2 | Retinal | To verify | Access on request (TRD Appendix A). Not requested. | Locked external test (DR) | France source. 1,748 images. | Not checked | To add |
| IDRiD | Retinal | To verify | Unknown | Locked external test (DR) | India source. Lesion and grade labels. | Not checked | To add |
| mBRSET | Retinal, handheld device | To verify | Credentialed access (TRD Appendix A). Not requested. | Locked external test (DR) | Brazil source. About 5,000 images. Allow weeks for approval. | Not checked | To add |
| DDR | Retinal | To verify | Unknown | Optional extra external test (DR) | China source. Only if time allows. | Not checked | To add |
| Team phone-photo set | Phone photos of displayed or printed X-rays | Built by the team, so no third-party licence. Consent and privacy rules still apply. | Not built yet (story E1-05) | Robustness test | 300 or more photos of distinct X-rays. No personal data in the images. Team storage only. | Not applicable | Product backlog E1-05 |
| Gate negatives | Mixed | To verify per source. Must have clear licences (TRD Appendix A). | Not selected | Gate training | Non-medical and other medical images. | Not checked | To add |

## 2. Access request log

TRD Appendix A already says which datasets are not a plain download. Start with the ones that need approval and are needed soonest, because approval is the slow part.

| Dataset | What is needed | Contact or portal | Requested on | Approved on | Next step |
|-------------------|----------------------------------|-------------------|--------------|-------------|-----------|
| mBRSET | Credentialed access | To add | | | Longest lead time. Needed for the DR external test. Start first. |
| Messidor-2 | Access request | To add | | | Needed for the DR external test. |
| EyePACS | Check and accept the competition terms | Kaggle | | | Needed before DR training (E3-01, Sprint 1). |
| IDRiD | Confirm the access route | To add | | | Needed for the DR external test. |
| VinDr-CXR | Confirm the terms | To add | | | Needed for the pneumonia external test. |
| CheXpert | Registration | To add | | | Lowest priority. Optional pretraining only. |

## 3. Open questions

1. **Shenzhen internal test.** TRD Appendix A gives Shenzhen a train and validation role. Data card v1 (PR #78) also builds an internal test split of 96 images. The team needs to confirm whether Shenzhen may serve as an internal test set, or whether internal test images come from TBX11K only. Record the answer here once decided.
2. **Where this file lives.** `ml/manifests/README.md` lists licence register entries in this folder and names Chelsea as its owner. Agree the path and the owner of edits with her before this merges.

## 4. Revision history

| Date | By | Change |
|------------|--------------------|--------|
| 21 Oct 2026 | Michael Sylvester | Skeleton. All 18 datasets from TRD Appendix A listed. Shenzhen row filled from data card v1. Everything else marked "To verify". |
