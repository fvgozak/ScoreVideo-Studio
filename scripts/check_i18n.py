#!/usr/bin/env python3
"""Validate ScoreVideo's JSON language packs and index.html coverage.

Run: python scripts/check_i18n.py
A nonzero exit code means an i18n consistency error was found.
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
PACK = BASE / "static" / "locales"
ATTRS = {"title", "aria-label", "aria-description", "aria-valuetext", "placeholder", "alt"}
HANGUL = re.compile(r"[가-힣]")
PARAM = re.compile(r"\{([a-zA-Z0-9_.]+)\}")


class StaticStrings(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.values: list[str] = []
        self.semantic: list[str] = []
        self.ignored_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "style", "svg"}:
            self.ignored_depth += 1
        if self.ignored_depth:
            return
        self.semantic.extend([value for key, value in attrs.items() if key == "data-i18n" or key.startswith("data-i18n-") and key[10:] in ATTRS and value])
        self.values.extend([value for key, value in attrs.items() if key in ATTRS and value])

    def handle_endtag(self, tag):
        if tag in {"script", "style", "svg"} and self.ignored_depth:
            self.ignored_depth -= 1

    def handle_data(self, data):
        if not self.ignored_depth and data.strip():
            self.values.append(data.strip())


def main() -> int:
    errors: list[str] = []
    try:
        packs = {code: json.loads((PACK / f"{code}.json").read_text(encoding="utf-8")) for code in ("ko", "en")}
    except (OSError, ValueError) as exc:
        print("i18n: invalid JSON language pack:", exc, file=sys.stderr)
        return 1
    ko, en = packs["ko"], packs["en"]
    for code, data in packs.items():
        if data.get("locale") != code:
            errors.append(f"{code}: locale must be {code!r}")
    for section in ("messages", "legacy"):
        keys_ko, keys_en = set(ko[section]), set(en[section])
        for key in sorted(keys_ko - keys_en):
            errors.append(f"en.json missing {section} key: {key}")
        for key in sorted(keys_en - keys_ko):
            errors.append(f"ko.json missing {section} key: {key}")
        for key in sorted(keys_ko & keys_en):
            if not isinstance(ko[section][key], str) or not ko[section][key].strip():
                errors.append(f"ko.json blank {section} value: {key}")
            if not isinstance(en[section][key], str) or not en[section][key].strip():
                errors.append(f"en.json blank {section} value: {key}")
            if section == "messages" and set(PARAM.findall(ko[section][key])) != set(PARAM.findall(en[section][key])):
                errors.append(f"placeholder mismatch: {key}")
    ids_ko = [rule["id"] for rule in ko["patterns"]]
    ids_en = [rule["id"] for rule in en["patterns"]]
    if ids_ko != ids_en:
        errors.append("pattern identifiers/order differ between language packs")
    for rule in en["patterns"]:
        try:
            re.compile(rule["pattern"])
        except re.error as err:
            errors.append(f"invalid pattern {rule['id']}: {err}")
        if not rule.get("template"):
            errors.append(f"empty pattern template: {rule['id']}")
    parser = StaticStrings()
    parser.feed((BASE / "static" / "index.html").read_text(encoding="utf-8"))
    # Users can always identify their language by its native label.
    for value in sorted(set(parser.values)):
        if HANGUL.search(value) and value not in ko["legacy"] and value not in ko["messages"].values():
            errors.append(f"HTML has untranslated literal: {value[:150]}")
    for key in sorted(set(parser.semantic)):
        if key not in ko["messages"] or key not in en["messages"]:
            errors.append(f"HTML references missing semantic key: {key}")
    for path in [BASE / "static" / "i18n.js", BASE / "static" / "app.js"]:
        source = path.read_text(encoding="utf-8")
        for key in re.findall(r"\bScoreI18n\.t\(\s*['\"]([^'\"]+)", source):
            if key not in ko["messages"] or key not in en["messages"]:
                errors.append(f"{path.name} references missing semantic key: {key}")
    if errors:
        for item in errors:
            print("ERROR:", item, file=sys.stderr)
        print(f"i18n validation failed: {len(errors)} issue(s)", file=sys.stderr)
        return 1
    print(f"i18n OK: {len(ko['messages'])} semantic messages, {len(ko['legacy'])} legacy phrases, {len(ko['patterns'])} dynamic patterns; HTML covered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
