#!/usr/bin/env python3
"""Check that every relative Markdown link and image resolves.

Scans the root README.md and every .md file under docs/ (or the paths given
as arguments). External links (http, https, mailto) and pure #anchors are
skipped. Exits 1 if any relative target does not exist.

Usage: python3 scripts/check_links.py [path ...]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# [text](target) or ![alt](target), optionally followed by a "title".
LINK = re.compile(r"!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
FENCE = re.compile(r"^\s*(```|~~~)")
SKIP = ("http://", "https://", "mailto:", "#")


def markdown_files(args: list[str]) -> list[Path]:
    if args:
        paths = [Path(a).resolve() for a in args]
    else:
        paths = [ROOT / "README.md", ROOT / "docs"]
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            files.extend(sorted(p.rglob("*.md")))
        elif p.exists():
            files.append(p)
    return files


def links_in(path: Path):
    in_fence = False
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        line = re.sub(r"`[^`]*`", "", line)  # ignore inline code
        for m in LINK.finditer(line):
            yield lineno, m.group(1)


def main(argv: list[str]) -> int:
    files = markdown_files(argv)
    checked = 0
    broken: list[str] = []
    for f in files:
        for lineno, target in links_in(f):
            if target.startswith(SKIP):
                continue
            checked += 1
            rel = target.split("#", 1)[0].split("?", 1)[0]
            if not (f.parent / rel).exists():
                broken.append(f"{f.relative_to(ROOT)}:{lineno}: {target}")
    print(f"Checked {checked} relative links in {len(files)} files.")
    if broken:
        print(f"{len(broken)} broken:")
        print("\n".join(f"  {b}" for b in broken))
        return 1
    print("All relative links resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
