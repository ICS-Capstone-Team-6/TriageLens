"""Tests for scripts/purge_referral_images.py with a fake HTTP opener (no network).
Run: python3 -m unittest discover -s scripts/tests"""
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import purge_referral_images as pr  # noqa: E402

KEY = "fake-service-key"


class FakeOpener:
    def __init__(self, due, delete_echo=True):
        self.due, self.delete_echo, self.calls = due, delete_echo, []

    def __call__(self, req):
        body = json.loads(req.data) if req.data else None
        self.calls.append((req.get_method(), req.full_url, body, dict(req.header_items())))
        if req.full_url.endswith("/rpc/referral_images_due_for_deletion"):
            out = self.due
        else:
            out = [{"name": n} for n in body["prefixes"]] if self.delete_echo else []
        return io.BytesIO(json.dumps(out).encode())


class PurgeTest(unittest.TestCase):
    env = {"SUPABASE_URL": "https://fake.example.invalid", "SUPABASE_SERVICE_ROLE_KEY": KEY}

    def run_main(self, opener, argv=()):
        with redirect_stdout(io.StringIO()) as out:
            code = pr.main(list(argv), env=self.env, opener=opener)
        return code, out.getvalue()

    def test_deletes_everything_due_in_batches(self):
        names = [f"{i:08d}-0000-0000-0000-000000000000/image.enc" for i in range(250)]
        op = FakeOpener(names)
        code, out = self.run_main(op)
        self.assertEqual(code, 0)
        deletes = [c for c in op.calls if c[0] == "DELETE"]
        self.assertEqual([len(c[2]["prefixes"]) for c in deletes], [100, 100, 50])
        self.assertTrue(all(c[1].endswith("/storage/v1/object/referral-images") for c in deletes))
        self.assertIn("deleted 250 of 250", out)

    def test_dry_run_deletes_nothing(self):
        op = FakeOpener(["a/image.enc"])
        code, out = self.run_main(op, ["--dry-run"])
        self.assertEqual(code, 0)
        self.assertFalse([c for c in op.calls if c[0] == "DELETE"])
        self.assertIn("1 referral image file(s) due", out)

    def test_fails_when_not_everything_was_deleted(self):
        code, _ = self.run_main(FakeOpener(["a/image.enc"], delete_echo=False))
        self.assertEqual(code, 1)

    def test_key_is_sent_but_never_printed(self):
        op = FakeOpener(["a/image.enc"])
        _, out = self.run_main(op)
        self.assertNotIn(KEY, out)
        self.assertEqual(op.calls[0][3]["Apikey"], KEY)

    def test_refuses_plain_http_except_localhost(self):
        with self.assertRaises(SystemExit):
            pr.check_url("http://fake.example.invalid")
        self.assertEqual(pr.check_url("http://127.0.0.1:54321/"), "http://127.0.0.1:54321")

    def test_needs_the_key(self):
        with self.assertRaises(SystemExit):
            pr.main([], env={"SUPABASE_URL": "https://x.invalid"}, opener=FakeOpener([]))

    def test_rejects_an_odd_answer(self):
        with self.assertRaises(SystemExit):
            self.run_main(FakeOpener({"not": "a list"}))


if __name__ == "__main__":
    unittest.main()
