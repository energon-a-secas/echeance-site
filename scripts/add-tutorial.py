#!/usr/bin/env python3
"""Append one renewal tutorial to data/tutorials.yaml, validated.

data/tutorials.yaml opens with three rules in a comment: steps and insights carry
commands and traps, never secret values, never IP addresses, never account emails.
A rule in a comment is a rule that drifts, so this script enforces all three, plus
the schema the site and build-llms.py both assume. build-llms.py validates nothing
today, so a malformed entry silently produces a wrong llms.txt.

It APPENDS TEXT rather than round-tripping the YAML on purpose: CLAUDE.md records
that date scalars do not survive a load/dump cycle here, and a writer that quietly
rewrites six good entries to add a seventh is worse than no writer.

Usage:
  python3 scripts/add-tutorial.py entry.json      # validate, then append
  python3 scripts/add-tutorial.py entry.json --check   # validate only
  cat entry.json | python3 scripts/add-tutorial.py -   # from stdin

Exit: 0 written or clean, 1 validation findings, 2 usage or environment error.
"""
import json
import pathlib
import re
import sys

try:
    import yaml
except ImportError:
    print("add-tutorial: pyyaml is required (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

ROOT = pathlib.Path(__file__).resolve().parent.parent
TUTORIALS = ROOT / "data" / "tutorials.yaml"

REQUIRED_STR = ["id", "title", "service", "applies_to", "verify", "revoke"]
REQUIRED_LIST = ["signals", "steps", "insights"]
KNOWN_KINDS = {"api-key", "oauth-session", "ssh-key", "ip-whitelist"}

# Shapes that must never reach a public site. Deliberately narrow: a validator
# that cries wolf on every hex string is one an author turns off.
SECRETS = [
    (r"\bgh[pousr]_[A-Za-z0-9]{16,}", "a GitHub token"),
    (r"\bsk-[A-Za-z0-9]{20,}", "an OpenAI-style key"),
    (r"\bAKIA[0-9A-Z]{16}\b", "an AWS access key id"),
    (r"\bxox[baprs]-[A-Za-z0-9-]{10,}", "a Slack token"),
    (r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.", "a JWT"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "a private key"),
    (r"\b[0-9]{1,3}(\.[0-9]{1,3}){3}\b", "an IP address"),
    (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "an email address"),
]
# Documentation placeholders and version-ish strings are not leaks.
ALLOW = re.compile(r"0\.0\.0\.0|127\.0\.0\.1|1\.2\.3\.4|example\.(com|org)|<[^>]+>", re.I)


def fail(msg):
    print(f"\033[31m  {msg}\033[0m")


def main():
    args = [a for a in sys.argv[1:]]
    check_only = "--check" in args
    args = [a for a in args if a != "--check"]
    if len(args) != 1:
        print(__doc__.split("Usage:")[1].split("Exit:")[0].strip(), file=sys.stderr)
        return 2

    try:
        raw = sys.stdin.read() if args[0] == "-" else pathlib.Path(args[0]).read_text()
        entry = json.loads(raw)
    except FileNotFoundError:
        print(f"add-tutorial: no such file: {args[0]}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as e:
        print(f"add-tutorial: entry is not valid JSON: {e}", file=sys.stderr)
        return 2
    if not isinstance(entry, dict):
        print("add-tutorial: entry must be a JSON object", file=sys.stderr)
        return 2

    doc = yaml.safe_load(TUTORIALS.read_text())
    existing = {t["id"] for t in doc.get("tutorials", [])}

    bad = False
    for k in REQUIRED_STR:
        v = entry.get(k)
        if not isinstance(v, str) or not v.strip():
            fail(f"missing or empty required field: {k}")
            bad = True
    for k in REQUIRED_LIST:
        v = entry.get(k)
        if not isinstance(v, list) or not v or not all(isinstance(x, str) and x.strip() for x in v):
            fail(f"{k} must be a non-empty list of non-empty strings")
            bad = True

    tid = entry.get("id", "")
    if isinstance(tid, str) and tid:
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", tid):
            fail(f"id must be kebab-case: {tid!r}")
            bad = True
        if tid in existing:
            fail(f"id already exists: {tid}. Edit that entry instead of adding a second.")
            bad = True

    kind = entry.get("applies_to")
    if isinstance(kind, str) and kind not in KNOWN_KINDS:
        # A new credential kind is legitimate, but it changes what the site filters on.
        print(f"\033[33m  note: applies_to {kind!r} is new. Existing kinds: "
              f"{', '.join(sorted(KNOWN_KINDS))}\033[0m")

    links = entry.get("links", [])
    if links and not (isinstance(links, list) and all(
            isinstance(l, dict) and {"label", "url"} <= set(l) for l in links)):
        fail("links must be a list of {label, url} objects")
        bad = True

    for k in REQUIRED_STR + REQUIRED_LIST:
        vals = entry.get(k) if isinstance(entry.get(k), list) else [entry.get(k)]
        for v in vals:
            if not isinstance(v, str):
                continue
            for pat, what in SECRETS:
                for m in re.finditer(pat, v):
                    if ALLOW.search(m.group(0)):
                        continue
                    fail(f"{k} looks like it contains {what}: {m.group(0)[:24]}...")
                    fail("  tutorials.yaml is published. Use a placeholder shape instead.")
                    bad = True

    unknown = set(entry) - set(REQUIRED_STR) - set(REQUIRED_LIST) - {"links"}
    if unknown:
        fail(f"unknown field(s), the site will ignore them: {', '.join(sorted(unknown))}")
        bad = True

    if bad:
        return 1
    if check_only:
        print(f"\033[32m  {tid} is valid, not written (--check)\033[0m")
        return 0

    def scalar(v):
        return yaml.safe_dump(v, default_style='"', allow_unicode=True, width=10**6).strip()

    out = [f"  - id: {tid}"]
    for k in ["title", "service", "applies_to"]:
        out.append(f"    {k}: {entry[k]}")
    for k in ["signals", "steps"]:
        out.append(f"    {k}:")
        out += [f"      - {scalar(x)}" for x in entry[k]]
    for k in ["verify", "revoke"]:
        out.append(f"    {k}: {scalar(entry[k])}")
    out.append("    insights:")
    out += [f"      - {scalar(x)}" for x in entry["insights"]]
    if links:
        out.append("    links:")
        for l in links:
            out.append(f"      - label: {l['label']}")
            out.append(f"        url: {l['url']}")

    text = TUTORIALS.read_text().rstrip("\n")
    TUTORIALS.write_text(text + "\n\n" + "\n".join(out) + "\n")

    # Prove the file still parses and grew by exactly one, or put it back.
    try:
        after = yaml.safe_load(TUTORIALS.read_text())
        assert len(after["tutorials"]) == len(doc["tutorials"]) + 1
        assert after["tutorials"][-1]["id"] == tid
    except Exception as e:
        TUTORIALS.write_text(text + "\n")
        fail(f"append produced an unparseable file, reverted: {e}")
        return 1

    print(f"\033[32m  added {tid} ({len(after['tutorials'])} tutorials). "
          f"Now run: make llms, then commit both files.\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
