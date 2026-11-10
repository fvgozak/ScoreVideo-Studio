from app import RenderRequest

def test_cursor_config_roundtrip():
    config = RenderRequest(cursor_visible=False, cursor_motion='smooth')
    payload = config.model_dump()
    assert payload['cursor_visible'] is False
    assert payload['cursor_motion'] == 'smooth'
    assert RenderRequest.model_validate(payload).cursor_visible is False

def test_cursor_step_supported():
    assert RenderRequest(cursor_motion='step').cursor_motion == 'step'
