"""Delete referral images 60 days after the referral closed (E10-07, ADR-28 section 4).

The database lists the files that are due (public.referral_images_due_for_deletion,
service role only); this script removes them through the Storage API, which also
deletes the stored bytes. Python standard library only. Run daily, for example from
.github/workflows/purge-referral-images.yml.

Environment:
  SUPABASE_URL                 https URL of the project (http only for localhost)
  SUPABASE_SERVICE_ROLE_KEY    service role key; never commit it, never print it

Usage:
  python3 scripts/purge_referral_images.py            delete what is due
  python3 scripts/purge_referral_images.py --dry-run  only count what is due
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

BUCKET = "referral-images"
BATCH = 100


def check_url(url):
    p = urllib.parse.urlparse(url or "")
    local = p.hostname in ("localhost", "127.0.0.1")
    if p.scheme != "https" and not (p.scheme == "http" and local):
        raise SystemExit("SUPABASE_URL must be https (http only for localhost)")
    return url.rstrip("/")


def _call(opener, method, url, key, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={
        "apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with opener(req) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def due(base, key, opener=urllib.request.urlopen):
    names = _call(opener, "POST", f"{base}/rest/v1/rpc/referral_images_due_for_deletion", key, {})
    if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
        raise SystemExit("unexpected answer from referral_images_due_for_deletion")
    return names


def purge(base, key, names, opener=urllib.request.urlopen):
    removed = 0
    for i in range(0, len(names), BATCH):
        batch = names[i:i + BATCH]
        out = _call(opener, "DELETE", f"{base}/storage/v1/object/{BUCKET}", key, {"prefixes": batch})
        removed += len(out) if isinstance(out, list) else 0
    return removed


def main(argv=None, env=os.environ, opener=urllib.request.urlopen):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args(argv)
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY is not set")
    base = check_url(env.get("SUPABASE_URL", ""))
    names = due(base, key, opener)
    if a.dry_run:
        print(f"{len(names)} referral image file(s) due for deletion")
        return 0
    removed = purge(base, key, names, opener) if names else 0
    print(f"deleted {removed} of {len(names)} referral image file(s) due")
    return 0 if removed == len(names) else 1


if __name__ == "__main__":
    sys.exit(main())
