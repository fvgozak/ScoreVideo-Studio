"""v27.2: color drag avoids synchronous localStorage thrash, keeps selected staff colors."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def test_staff_color_picker_storage_is_debounced():
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page()
        page.set_content('<div data-editor-panel="effects"><section class="panel"><div class="fx-quick-group" data-fx-group="score"></div></section></div>')
        page.evaluate('''()=>{
          window.writes=[];const entries=new Map();
          Object.defineProperty(window,'localStorage',{configurable:true,value:{
            getItem:k=>entries.get(k)||null,setItem:(k,v)=>{writes.push([k,v]);entries.set(k,v);},
            removeItem:k=>entries.delete(k)
          }});
        }''')
        page.add_script_tag(path=str(ROOT/'static/staff-colors.js'))
        page.evaluate('''()=>{
          const meta={id:'preview-v272',has_score:true,staff_groups:[
            {id:'P1',name:'Oboe',staves:1},{id:'P2',name:'Clarinet',staves:1},
            {id:'P3',name:'Bassoon',staves:1}]};
          ScoreStaffColors.setProject(meta);
          const enabled=document.querySelector('#staffColorsEnabled');
          enabled.checked=true;enabled.dispatchEvent(new Event('change'));
          const color=document.querySelector('[data-staff-key="P2:1"]');
          for(let i=0;i<100;i++){
            color.value='#bb'+i.toString(16).padStart(2,'0')+'44';
            color.dispatchEvent(new Event('input'));
          }
        }''')
        assert page.evaluate('writes.length')==1, 'drag should not write synchronously per input event'
        page.wait_for_timeout(320)
        stored=page.evaluate('''()=>({length:writes.length,
          value:JSON.parse(localStorage.getItem('scoremotion.staffColors.v1.preview-v272')),
          config:ScoreStaffColors.getConfig()})''')
        assert stored['length']==2,stored
        assert stored['value']['enabled'] and stored['value']['colors']['P2:1']=='#bb6344',stored
        page.evaluate('''()=>{
          const color=document.querySelector('[data-staff-key="P2:1"]');
          color.value='#ff0055';color.dispatchEvent(new Event('change'));
        }''')
        assert page.evaluate("JSON.parse(localStorage.getItem('scoremotion.staffColors.v1.preview-v272')).colors['P2:1']")=='#ff0055'
        browser.close()
