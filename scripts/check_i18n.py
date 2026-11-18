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
    locales=("ko","en","ja")
    try:
        packs={code:json.loads((PACK/f"{code}.json").read_text(encoding="utf-8")) for code in locales}
    except (OSError, ValueError) as exc:
        print("i18n: invalid JSON language pack:",exc,file=sys.stderr)
        return 1
    ko=packs['ko']
    for code, data in packs.items():
        if data.get('locale')!=code:errors.append(f"{code}: invalid locale header")
        for section in ('messages','legacy'):
            ref=set(ko[section]);actual=set(data.get(section,{}))
            for key in sorted(ref-actual):errors.append(f"{code}: missing {section}: {key}")
            for key in sorted(actual-ref):errors.append(f"{code}: unexpected {section}: {key}")
            for key in sorted(ref&actual):
                value=data[section][key]
                if not isinstance(value,str) or not value.strip():
                    errors.append(f"{code}: empty/invalid {section}: {key}")
                if section=='messages' and set(PARAM.findall(value))!=set(PARAM.findall(ko[section][key])):
                    errors.append(f"{code}: placeholder mismatch: {key}")
        ko_patterns=ko['patterns'];loc_patterns=data.get('patterns',[])
        if [r['id'] for r in ko_patterns]!=[r['id'] for r in loc_patterns]:
            errors.append(f"{code}: pattern IDs or order mismatch")
        for rule in loc_patterns:
            try:re.compile(rule['pattern'])
            except re.error as exc:errors.append(f"{code}: invalid dynamic regex {rule['id']}: {exc}")
            if not rule.get('template'):errors.append(f"{code}: missing dynamic template {rule['id']}")
    parser = StaticStrings()
    parser.feed((BASE / "static" / "index.html").read_text(encoding="utf-8"))
    # Users can always identify their language by its native label.
    for value in sorted(set(parser.values)):
        if HANGUL.search(value) and value not in ko["legacy"] and value not in ko["messages"].values():
            errors.append(f"HTML has untranslated literal: {value[:150]}")
    for key in sorted(set(parser.semantic)):
        if any(key not in packs[code]["messages"] for code in locales):
            errors.append(f"HTML references missing semantic key: {key}")
    for path in [BASE / "static" / "i18n.js", BASE / "static" / "app.js"]:
        source = path.read_text(encoding="utf-8")
        for key in re.findall(r"\bScoreI18n\.t\(\s*['\"]([^'\"]+)", source):
            if any(key not in packs[code]["messages"] for code in locales):
                errors.append(f"{path.name} references missing semantic key: {key}")
    if errors:
        for item in errors:
            print("ERROR:", item, file=sys.stderr)
        print(f"i18n validation failed: {len(errors)} issue(s)", file=sys.stderr)
        return 1
    print(f"i18n OK: {len(locales)} locales, {len(ko['messages'])} semantic messages, {len(ko['legacy'])} legacy phrases, {len(ko['patterns'])} dynamic patterns; HTML covered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
