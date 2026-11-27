from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def test_zoom_reset_is_hidden_but_existing_controls_remain():
    html = (ROOT / 'static/index.html').read_text()
    css = (ROOT / 'static/workspace-ui.css').read_text()
    assert re.search(r'#zoomResetButton\s*\{\s*display:\s*none\s*!important;', css)
    assert len(re.findall(r'\bid=["\']zoomResetButton["\']', html)) == 1
    assert 'hideZoomReset1' in html
    for key in ('zoom', 'zoomInButton', 'zoomOutButton', 'zoomVal'):
        assert f'id="{key}"' in html
