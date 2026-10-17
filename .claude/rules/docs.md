---
paths:
  - "docs/**"
---

# Documentation

Source: Team Rules 2, 6, 12; TRD 12.5; NFR-USAB-04. Full guide: `docs-adr-modelcard` skill.

- `docs/planning/` is baseline v1.0 and frozen. Do not edit. The only allowed change is a new row in the change log of `04_Team_Rules_and_Requirements.md`.
- Change a requirement through a new ADR in `docs/adr/` (copy `0000-template.md`), plus the change-log row.
- Never rewrite an accepted ADR. Supersede it with a new one.
- Every relative link must resolve. Run `python3 scripts/check_links.py` after edits.
- No em dashes. Use a full stop, comma or colon.
- Plain language at grade 8 or lower; short sentences.
- Cite sources like "(TRD 7.2)" and story IDs like `E8-05`.
- Every metric names its dataset, threshold and 95% CI. Report weak results too.
- Add new documents to `docs/README.md`.
- No patient data, participant names, real case images or secrets.
