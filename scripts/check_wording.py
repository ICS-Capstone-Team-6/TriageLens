#!/usr/bin/env python3
"""Block forbidden result wording in user-facing strings (TRD 7.3, 13.2; Team Rules 9.1, 11).

Scans UI string sources under apps/pwa and packages/triage:
  - locale and string files (*.json, *.yaml, *.yml, *.po) under a folder named
    locales, locale, i18n, strings or messages: every value is checked;
  - source files (*.ts, *.tsx, *.js, *.jsx, *.html, *.vue, *.svelte): string
    literals and JSX/HTML text are checked.

Not scanned (allowlist): Markdown and other docs, tests (*.test.*, *.spec.*,
__tests__/, tests/), and anything outside the two UI roots. The TRD and the
docs must be able to name the forbidden words.

A line can be exempted with a trailing comment containing
"wording-lint: allow <reason>". Use it only for non-user-facing strings.

Usage: python3 scripts/check_wording.py [path ...]
Exit code 1 if a forbidden word is found.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UI_ROOTS = [ROOT / "apps" / "pwa", ROOT / "packages" / "triage"]

# TRD 7.3 and Team Rules 9.1; "no disease" from FR-05.
FORBIDDEN = ["diagnosis", "positive", "negative", "healthy", "you do not have", "no disease"]
PATTERN = re.compile(r"\b(" + "|".join(re.escape(w).replace(r"\ ", r"\s+") for w in FORBIDDEN) + r")\b", re.I)
ALLOW_MARK = "wording-lint: allow"

SOURCE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".vue", ".svelte"}
STRING_EXT = {".json", ".yaml", ".yml", ".po"}
STRING_DIRS = {"locales", "locale", "i18n", "strings", "messages", "lang"}
SKIP_DIRS = {"node_modules", "dist", "build", "coverage", "__tests__", "tests", "test", "e2e", ".vite"}
TEST_FILE = re.compile(r"\.(test|spec)\.[^.]+$")

# String literals and JSX/HTML text between tags.
LITERAL = re.compile(r"""(?P<q>["'`])(?P<s>(?:\\.|(?!(?P=q)).)*)(?P=q)""")
TAG_TEXT = re.compile(r">([^<>{}]+)<")
LINE_COMMENT = re.compile(r"^\s*(//|\*|/\*)")


def is_skipped(path: Path) -> bool:
    return any(p in SKIP_DIRS for p in path.parts) or bool(TEST_FILE.search(path.name))


def is_string_file(path: Path) -> bool:
    return path.suffix in STRING_EXT and any(p.lower() in STRING_DIRS for p in path.parts)


def candidate_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for base in paths:
        it = [base] if base.is_file() else (sorted(base.rglob("*")) if base.exists() else [])
        for f in it:
            if not f.is_file() or is_skipped(f.relative_to(base) if f != base else Path(f.name)):
                continue
            if f.suffix in SOURCE_EXT or is_string_file(f):
                files.append(f)
    return files


def json_strings(text: str):
    """Yield every string value (not key) in a JSON document."""
    def walk(v):
        if isinstance(v, str):
            yield v
        elif isinstance(v, dict):
            for x in v.values():
                yield from walk(x)
        elif isinstance(v, list):
            for x in v:
                yield from walk(x)
    yield from walk(json.loads(text))


def find_in_line(line: str, source: bool) -> list[str]:
    if ALLOW_MARK in line:
        return []
    if source:
        if LINE_COMMENT.match(line):
            return []
        chunks = [m.group("s") for m in LITERAL.finditer(line)] + TAG_TEXT.findall(line)
    else:
        chunks = [line]
    return [m.group(1) for c in chunks for m in PATTERN.finditer(c)]


def check_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    hits: list[str] = []
    rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    if path.suffix == ".json":
        try:
            values = set(json_strings(text))
        except ValueError:
            values = None
        for n, line in enumerate(text.splitlines(), 1):
            if values is not None and not any(v in line for v in values if PATTERN.search(v)):
                continue
            for w in find_in_line(line, source=False):
                hits.append(f"{rel}:{n}: forbidden word '{w}'")
        return hits
    source = path.suffix in SOURCE_EXT
    for n, line in enumerate(text.splitlines(), 1):
        for w in find_in_line(line, source):
            hits.append(f"{rel}:{n}: forbidden word '{w}'")
    return hits


def main(argv: list[str]) -> int:
    roots = [Path(a).resolve() for a in argv] if argv else UI_ROOTS
    files = candidate_files(roots)
    hits = [h for f in files for h in check_file(f)]
    print(f"Wording lint: scanned {len(files)} UI files.")
    if hits:
        print("Forbidden result wording found (TRD 7.3). Use: high risk, low risk, refer, not sure, retake.")
        print("\n".join(f"  {h}" for h in hits))
        return 1
    print("No forbidden wording.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
