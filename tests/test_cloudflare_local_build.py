"""Local-only Pages distribution must never deploy the old API proxy."""
from pathlib import Path
from scripts.build_cloudflare_local import build


def test_cloudflare_local_build_is_static_and_offline(tmp_path):
    dest=tmp_path/'release-cloudflare-local'/'dist'
    build(dest)
    text=(dest/'index.html').read_text()
    assert 'window.SCOREMOTION_LOCAL_ONLY=true;' in text
    assert text.index('window.SCOREMOTION_LOCAL_ONLY=true;') < text.index('/static/app.js')
    assert (dest/'static/local-projects.js').exists()
    assert (dest/'static/local-midi.js').exists()
    assert (dest/'static/local-musicxml.js').exists()
    assert (dest/'static/audio/salamander/NOTICE.txt').exists()
    assert (dest/'examples/dream-journey/dream-journey.mid').exists()
    assert not (dest/'app.py').exists()
    assert not (dest/'functions').exists()
    assert not (dest/'_routes.json').exists()
    assert '/api/* /404.html 404' in (dest/'_redirects').read_text()
