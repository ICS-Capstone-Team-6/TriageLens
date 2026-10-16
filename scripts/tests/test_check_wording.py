"""Tests for scripts/check_wording.py. Run: python3 -m unittest discover -s scripts/tests"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import check_wording as cw  # noqa: E402


class WordingLintTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rel, text):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        return p

    def run_lint(self):
        return cw.main([str(self.root)])

    def test_each_forbidden_word_in_locale_file_fails(self):
        for word in ["diagnosis", "Positive", "NEGATIVE", "healthy", "you do not have", "You  do not  have", "no disease"]:
            with self.subTest(word=word):
                f = self.write("src/locales/en.json", json.dumps({"result": {"msg": f"Result: {word}"}}))
                self.assertEqual(cw.check_file(f) != [], True, word)

    def test_allowed_wording_passes(self):
        self.write("src/locales/en.json", json.dumps({
            "refer": "High risk on this scan. Refer for a TB confirmation test.",
            "unsure": "Not sure. Retake the image, or refer.",
            "low": "Low risk on this scan. This does not rule out disease. If symptoms continue, test or refer.",
            "reminder": "Screening support only. A clinician decides.",
        }))
        self.assertEqual(self.run_lint(), 0)

    def test_json_keys_are_not_checked(self):
        self.write("src/i18n/en.json", '{\n  "negativeCase": "Low risk",\n  "positive": "High risk"\n}\n')
        self.assertEqual(self.run_lint(), 0)

    def test_string_literal_in_tsx_fails(self):
        self.write("src/Result.tsx", 'export const t = () => <p>{"You are healthy"}</p>;\n')
        self.assertEqual(self.run_lint(), 1)

    def test_jsx_text_fails(self):
        self.write("src/Result.tsx", "export const R = () => <h1>Negative result</h1>;\n")
        self.assertEqual(self.run_lint(), 1)

    def test_identifiers_and_comments_pass(self):
        self.write("src/rules.ts",
                   "// a negative score is clamped\n"
                   "const isNegative = score < 0;\n"
                   "const falsePositiveRate = fp / (fp + tn);\n")
        self.assertEqual(self.run_lint(), 0)

    def test_tests_and_docs_are_allowlisted(self):
        self.write("src/rules.test.ts", 'expect(lint("healthy")).toBe(false);\n')
        self.write("src/__tests__/x.ts", 'const s = "diagnosis";\n')
        self.write("tests/e2e.spec.ts", 'const s = "positive";\n')
        self.write("README.md", "Never say diagnosis or healthy.\n")
        self.assertEqual(self.run_lint(), 0)

    def test_inline_allow_marker(self):
        self.write("src/log.ts", 'log("negative index"); // wording-lint: allow internal log, not shown to users\n')
        self.assertEqual(self.run_lint(), 0)

    def test_json_outside_string_folder_is_ignored(self):
        self.write("package.json", '{"description": "healthy app"}')
        self.assertEqual(self.run_lint(), 0)

    def test_repo_ui_roots_pass_today(self):
        self.assertEqual(cw.main([]), 0)


if __name__ == "__main__":
    unittest.main()
