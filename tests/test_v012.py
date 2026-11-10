from app import RenderRequest
from pydantic import ValidationError
import pytest


def test_score_viewport_export_fields():
    request=RenderRequest(score_area_width=90, score_area_height=50,
        score_margin_top=20, score_margin_bottom=15,
        score_panel_color='#112233', score_panel_opacity=.6)
    data=request.model_dump()
    assert data['score_area_width']==90
    assert data['score_panel_opacity']==.6
    assert data['score_margin_bottom']==15


@pytest.mark.parametrize('kwargs', [
    {'score_area_width':9}, {'score_area_height':9},
    {'score_margin_top':60}, {'score_margin_bottom':60},
    {'score_panel_color':'red'}, {'score_panel_opacity':1.1}
])
def test_score_viewport_validation(kwargs):
    with pytest.raises(ValidationError): RenderRequest(**kwargs)
