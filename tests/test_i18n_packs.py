"""Static regression checks for the JSON language packs."""
import json
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


def test_language_pack_structure():
    ko = json.loads((BASE / 'static/locales/ko.json').read_text())
    en = json.loads((BASE / 'static/locales/en.json').read_text())
    assert ko['locale'] == 'ko' and en['locale'] == 'en'
    assert set(ko['messages']) == set(en['messages'])
    assert set(ko['legacy']) == set(en['legacy'])
    assert [x['id'] for x in ko['patterns']] == [x['id'] for x in en['patterns']]


def test_recent_ui_messages_present():
    en = json.loads((BASE / 'static/locales/en.json').read_text())
    for source in ('악보 상단 자르기','건반 타건 빛','렌더링 취소','출력 방식','배경 세로 위치'):
        assert source in en['legacy']
        assert en['legacy'][source] != source


def test_i18n_validator():
    proc = subprocess.run([sys.executable, str(BASE / 'scripts/check_i18n.py')],cwd=BASE, capture_output=True,text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
