from app import RenderRequest


def test_export_keeps_score_and_piano_offsets_independent():
    settings = RenderRequest(offset_sec=-0.1, piano_offset_sec=0.25)
    payload = settings.model_dump()
    assert payload["offset_sec"] == -0.1
    assert payload["piano_offset_sec"] == 0.25
    assert RenderRequest().piano_offset_sec == 0
