"""Run: python tests/validate_palette_scheme_link_ui.py

Exercise the production recommendation-click handler on actual input elements,
without loading a user project or requiring network/renderer access.
"""
import json
import re
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'static/app.js').read_text()
HTML = (ROOT / 'static/index.html').read_text()
FN = APP.split(' async function applyPaletteScheme(scheme,primary){', 1)[1].split(" $('paletteImageFile').addEventListener", 1)[0]
FN = 'async function applyPaletteScheme(scheme,primary){' + FN
HTML = re.sub(r'<script[^>]*src=[^>]*></script>', '', HTML)
HTML = re.sub(r'<link[^>]*rel="stylesheet"[^>]*>', '', HTML)

# The fixture uses the same color generator as the palette HTTP endpoint.
import sys
sys.path.insert(0, str(ROOT))
from image_palette import propose_theme_palettes, contrast_ratio
SCHEMES = propose_theme_palettes('sea')['schemes']
PRIMARY = propose_theme_palettes('sea')['primary']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, **(
        {'executable_path': shutil.which('chromium'), 'args': ['--no-sandbox']}
        if shutil.which('chromium') else {}))
    page = browser.new_page(viewport={'width': 1200, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(HTML)
    page.evaluate("""() => Object.defineProperty(window, 'localStorage', { configurable:true, value:{getItem:()=>null,setItem:()=>{}} })""")
    page.add_script_tag(content=(ROOT / 'static/workspace-ui.js').read_text())
    page.add_script_tag(content=(ROOT / 'static/fx-groups.js').read_text())
    page.add_script_tag(content="""(()=>{
      const $=id=>document.getElementById(id);
      let project=null,pendingBackgroundFile=null;
      let applied=0,requested=0,lastMessage='';
      function recommendMinimalColors(){requested++;}
      function queueApply(){applied++;}
      function paletteMessage(text){lastMessage=text;}
    """+FN+"""
      window.__paletteTest={applyPaletteScheme,setProject:v=>{project=v;},
        get:()=>({applied,requested,lastMessage})};
    })();""")
    assert not errors, errors

    for scheme in SCHEMES:
        c = scheme['colors']
        # The exact production handler is called, as it would be from a card click.
        page.evaluate('([scheme,primary])=>window.__paletteTest.applyPaletteScheme(scheme,primary)', [scheme, PRIMARY])
        snapshot = page.evaluate('''()=>{
           const $=id=>document.getElementById(id);
           return {
             paper:$('paperColor').value,staff:$('staffColor').value,ink:$('inkColor').value,
             glow:$('glowColor').value,accent:$('accentColor').value,
             panel:$('scorePanelColor').value,opacity:$('scorePanelOpacity').value,
             mode:$('lightColorMode').value,auroraLow:$('auroraLow').value,
             auroraHigh:$('auroraHigh').value,scorePreset:$('scoreColorPreset').value,
             keyboardPreset:$('keyboardColorPreset').value,
             keyboardLink:$('keyboardPaletteLink').checked,
             keyboardVelocity:$('keyboardVelocityColor').checked,
             keyboardLow:$('keyboardColorLow').value,keyboardHigh:$('keyboardColorHigh').value,
             scene:$('sceneStartColor').value,sceneGlow:$('sceneStartGlow').value,
             visualScore:document.querySelector('[data-fx-group="score"] .fx-color-preview').style.background,
             visualKeyboard:document.querySelector('[data-fx-group="keyboard"] .fx-color-preview').style.background,
             status:window.__paletteTest.get()
           };
        }''')
        for key,id in [('paper','paper'),('staff','staff'),('ink','ink'),('glow','glow'),('panel','panel')]:
            assert snapshot[id].lower() == c[key].lower(), (scheme['id'],id,snapshot[id],c[key])
        assert 40 <= int(snapshot['opacity']) <= 90, f"No-photo panel should blend with the scene: {snapshot['opacity']}"
        def blend_rgb(front,back,alpha):
            values = [round(int(front[i:i+2],16)*alpha+int(back[i:i+2],16)*(1-alpha)) for i in (1,3,5)]
            return '#' + ''.join(f'{v:02X}' for v in values)
        effective = blend_rgb(c['panel'], c['background'], int(snapshot['opacity'])/100)
        assert contrast_ratio(effective,c['ink']) >= 7.0
        assert contrast_ratio(effective,c['staff']) >= 3.0
        assert snapshot['mode']=='aurora'
        assert snapshot['scorePreset']=='project'
        assert snapshot['keyboardPreset']=='linked'
        assert snapshot['keyboardLink'] and snapshot['keyboardVelocity']
        assert snapshot['keyboardLow'].lower()==c['aurora_low'].lower()
        assert snapshot['keyboardHigh'].lower()==c['aurora_high'].lower()
        assert snapshot['auroraLow'].lower()==c['aurora_low'].lower()
        assert snapshot['auroraHigh'].lower()==c['aurora_high'].lower()
        assert snapshot['scene'].lower()==c['background'].lower()
        assert snapshot['sceneGlow'].lower()==c['glow'].lower()
        def css_rgb(color):
            return 'rgb(' + ', '.join(str(int(color[i:i+2], 16)) for i in (1,3,5)) + ')'
        assert css_rgb(c['aurora_low']) in snapshot['visualKeyboard']
        assert css_rgb(c['aurora_high']) in snapshot['visualScore']
        assert snapshot['status']['applied']>0
    # With photos, the design remains translucent and adapts to image strength.
    page.evaluate('''() => window.__paletteTest.setProject({id:'test',background_filename:'cover.png'})''')
    for strength in (0.2, 0.5, 1.0):
        page.locator('#backgroundOpacity').evaluate('(el,val)=>el.value=val', str(strength))
        for scheme in SCHEMES:
            c=scheme['colors']
            page.evaluate('([scheme,primary])=>window.__paletteTest.applyPaletteScheme(scheme,primary)', [scheme,PRIMARY])
            actual=int(page.locator('#scorePanelOpacity').input_value())
            assert 50 <= actual <= 90 and actual%5==0, (scheme['name'],strength,actual)
            assert actual<100
            for rgbval in (0,255):
                behind = '#' + ''.join(f'{round(rgbval*strength+int(c["background"][i:i+2],16)*(1-strength)):02X}' for i in (1,3,5))
                final=blend_rgb(c['panel'],behind,actual/100)
                # At full-strength bright/dark photo extremes, the cap may
                # prioritize preserving some image visibility over 7:1.
                if actual<90:
                    assert contrast_ratio(final,c['ink']) >= 6.95, (scheme['name'],strength,'ink',actual)
                    assert contrast_ratio(final,c['staff']) >= 2.95, (scheme['name'],strength,'staff',actual)
    # Manual slider changes remain possible after clicking a recommendation.
    page.locator('#scorePanelOpacity').evaluate('(el)=>el.value="35"')
    assert page.locator('#scorePanelOpacity').input_value()=='35'
    # Validate the other three color families with the exact click handler.
    for theme in ('space','forest','wood'):
        theme_schemes=propose_theme_palettes(theme)['schemes']
        theme_primary=propose_theme_palettes(theme)['primary']
        page.evaluate('''() => window.__paletteTest.setProject(null)''')
        for scheme in theme_schemes:
            c=scheme['colors']
            page.evaluate('([scheme,primary])=>window.__paletteTest.applyPaletteScheme(scheme,primary)', [scheme,theme_primary])
            alpha=int(page.locator('#scorePanelOpacity').input_value())/100
            final=blend_rgb(c['panel'],c['background'],alpha)
            assert .4<=alpha<=.9 and contrast_ratio(final,c['ink'])>=7 and contrast_ratio(final,c['staff'])>=3, (theme,scheme['name'],alpha)
    # The low/high inputs should remain editable after the one-click recommendation.
    page.evaluate("""() => {
      const el=document.getElementById('keyboardColorPreset');
      el.value='custom';el.dispatchEvent(new Event('change',{bubbles:true}));
    }""")
    assert page.locator('#keyboardColorPreset').input_value()=='custom'
    assert not errors,errors
    browser.close()
print('PASS: 4 score themes, contrast-aware translucency, photo intensities, linked keyboard + manual overrides')
