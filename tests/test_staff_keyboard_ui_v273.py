"""Real Chromium UI: extra toggle is below staff enable, persists, and is translatable."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def test_keyboard_color_toggle():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page()
        page.set_content('<div data-editor-panel="effects"><section class="panel"><div class="fx-quick-group" data-fx-group="score"></div></section></div>')
        page.evaluate("""()=>{const data=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}});}""")
        page.add_script_tag(path=str(ROOT/'static/staff-colors.js'))
        result=page.evaluate('''()=>{
          const id='staff273';
          const meta={id,has_score:true,staff_groups:[{id:'P1',name:'Oboe',staves:1},{id:'P2',name:'Clarinet in B♭',staves:1},{id:'P3',name:'Bassoon',staves:1}]};
          ScoreStaffColors.setProject(meta);
          const score=document.querySelector('#staffColorsEnabled');
          const keyboard=document.querySelector('#staffColorsKeyboard');
          const correctlyOrdered=score.compareDocumentPosition(keyboard)&Node.DOCUMENT_POSITION_FOLLOWING;
          const disabledBefore=keyboard.disabled;
          score.checked=true;score.dispatchEvent(new Event('change'));
          const enabledAfter=!keyboard.disabled;
          keyboard.checked=true;keyboard.dispatchEvent(new Event('change'));
          const color=document.querySelector('input[data-staff-key="P2:1"]');
          color.value='#cc77ff';color.dispatchEvent(new Event('change'));
          const config=ScoreStaffColors.getConfig();
          const stored=JSON.parse(localStorage.getItem('scoremotion.staffColors.v1.'+id));
          ScoreStaffColors.setProject(meta);
          const restored=ScoreStaffColors.getConfig();
          score.checked=false;score.dispatchEvent(new Event('change'));
          return {correctlyOrdered,disabledBefore,enabledAfter,config,stored,restored,disabledAfter:keyboard.disabled,keyboardRemembers:keyboard.checked};
        }''')
        assert result['correctlyOrdered'] and result['disabledBefore'] and result['enabledAfter'],result
        assert result['config']['keyboard'] and result['config']['colors']['P2:1']=='#cc77ff',result
        assert result['stored']['keyboard'] and result['restored']['keyboard'],result
        assert result['disabledAfter'] and result['keyboardRemembers'],result
        for lang in ('ko','en','ja'):
            locale=json.loads((ROOT/'static/locales'/f'{lang}.json').read_text())
            assert locale['messages']['staffColors.keyboard']
        browser.close()
