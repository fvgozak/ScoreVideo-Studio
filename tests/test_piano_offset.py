import pytest
from fastapi import HTTPException

import app
from app import RenderRequest


def test_export_keeps_score_and_piano_offsets_independent():
    settings = RenderRequest(offset_sec=-0.1, piano_offset_sec=0.25)
    payload = settings.model_dump()
    assert payload["offset_sec"] == -0.1
    assert payload["piano_offset_sec"] == 0.25
    assert RenderRequest().piano_offset_sec == 0
    assert RenderRequest().score_visible is True
    assert RenderRequest(score_visible=False).model_dump()["score_visible"] is False
    assert RenderRequest().piano_key_style == "auto"
    assert RenderRequest(piano_key_style="custom", piano_white_key_color="#445566").model_dump()["piano_white_key_color"] == "#445566"


def test_export_reports_missing_playwright_before_queuing(monkeypatch):
    monkeypatch.setattr(app, "project_path", lambda _: None)
    monkeypatch.setattr(app, "render_python", lambda: None)
    with pytest.raises(HTTPException) as exc:
        app.start_render("example", RenderRequest())
    assert exc.value.status_code == 503
    assert "Playwright" in exc.value.detail
    assert not app.render_lock.locked()
