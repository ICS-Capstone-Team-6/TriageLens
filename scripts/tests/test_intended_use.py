"""E0-04: the frozen intended-use page must match the TRD baseline exactly.

Run: python3 -m unittest discover -s scripts/tests
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRD = (ROOT / "docs" / "planning" / "01_TRD.md").read_text(encoding="utf-8")
PAGE = (ROOT / "docs" / "safety" / "intended-use.md").read_text(encoding="utf-8")


def cells(line):
    return [re.sub(r"\s+", " ", c).strip() for c in line.strip().strip("|").split("|")]


def metric_rows(text, heading):
    sec = text.split(heading, 1)[1]
    sec = re.split(r"\n#{1,2} ", sec, maxsplit=1)[0]
    rows = [cells(l) for l in sec.splitlines() if l.startswith("|")]
    return [r for r in rows if r[0] not in ("Area", "") and not set("".join(r)) <= set("-")]


class IntendedUseTest(unittest.TestCase):
    def test_metrics_match_trd_3_4(self):
        trd = metric_rows(TRD, "## 3.4 Success Metrics")
        page = metric_rows(PAGE, "## Success metrics (TRD 3.4)")
        self.assertEqual(len(trd), 16)
        self.assertEqual(page, trd)

    def test_statement_matches_trd_3_3(self):
        quote = re.search(r"## 3\.3 Intended Use.*?\n\n(> .+?)\n", TRD, re.S).group(1)
        self.assertIn(quote, PAGE)


if __name__ == "__main__":
    unittest.main()
