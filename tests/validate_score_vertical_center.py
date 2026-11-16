"""Browser geometry check for single-line centering without an app server."""
from pathlib import Path
from playwright.sync_api import sync_playwright

SOURCE = (Path(__file__).resolve().parents[1] / 'static' / 'score-core.js').read_text()
HTML = '''<style>
  #preview { transform-origin: 0 0; }
  #viewport { width: 500px; height: 260px; overflow: hidden; }
  #osmdContainer { position: relative; }
</style><div id="preview"><div id="viewport"><div id="osmdContainer">
  <svg width="500" height="700" xmlns="http://www.w3.org/2000/svg">
    <path id="ink" d="M10 100 H380 M10 500 H380" stroke="black" stroke-width="1"/>
  </svg>
</div></div></div>'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_content(HTML)
    page.add_script_tag(content=SOURCE)
    for scale in (1, .52):
        for height in (260, 380):
            result = page.evaluate('''({scale, height}) => {
              const preview=document.querySelector('#preview');
              const viewport=document.querySelector('#viewport');
              const container=document.querySelector('#osmdContainer');
              preview.style.transform=`scale(${scale})`;
              viewport.style.height=`${height}px`;
              const f=new ScoreFollower({tempoMap:[{beat:0,second:0,tempo_us:500000}],
                container,viewport,scrollMode:'horizontal'});
              f.centerEngraving();
              const first=f.scoreVerticalLayout.offset;
              f.centerEngraving();
              const svg=container.querySelector('svg');
              const bounds=svg.getBBox(),matrix=svg.getScreenCTM();
              const center=matrix.b*bounds.x+matrix.d*(bounds.y+bounds.height/2)+matrix.f;
              const vr=viewport.getBoundingClientRect();
              return {offset:first,repeat:f.scoreVerticalLayout.offset,
                center:(center-vr.top)/scale,desired:viewport.clientHeight/2};
            }''', {'scale': scale, 'height': height})
            assert result['offset'] == result['repeat'], result
            assert abs(result['center'] - result['desired']) <= 2, result
    assert page.evaluate('''() => {
      const f=new ScoreFollower({tempoMap:[{beat:0,second:0,tempo_us:500000}],
        container:document.querySelector('#osmdContainer'),
        viewport:document.querySelector('#viewport'),scrollMode:'vertical'});
      f.container.style.marginTop='-100px';f.centerEngraving();
      return f.container.style.marginTop==='0px' && f.scoreVerticalLayout===null;
    }''')
    browser.close()
print('Single-line SVG centering passed at 2 viewport sizes and 2 preview scales; page view unchanged')
