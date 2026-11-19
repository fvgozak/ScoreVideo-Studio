"""v27.1 regression: legacy local projects must expose staff color UI and recover MusicXML instruments."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def woodwind_score():
    specs=[('P1','Oboe',None,'C',5),('P2','',('Clarinet in B flat','-2'),'D',5),('P3','Bassoon',None,'G',3)]
    part_list=''.join(f'<score-part id="{pid}">'+(f'<part-name>{name}</part-name>' if name else '')+(f'<score-instrument id="I{pid}"><instrument-name>{tr[0]}</instrument-name></score-instrument>' if tr else '')+'</score-part>' for pid,name,tr,_,_ in specs)
    parts=''
    for pid,name,tr,step,octave in specs:
        trans=f'<transpose><chromatic>{tr[1]}</chromatic></transpose>' if tr else ''
        parts+=f'<part id="{pid}"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>{trans}</attributes><note><pitch><step>{step}</step><octave>{octave}</octave></pitch><duration>4</duration><type>whole</type></note></measure></part>'
    return f'<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list>{part_list}</part-list>{parts}</score-partwise>'


def setup(page):
    # Chromium in this sandbox blocks network navigation even when intercepted.
    # Test on about:blank with a minimal localStorage shim.
    page.set_content('''<div data-editor-panel="effects"><section class="panel"><div class="fx-quick-group" data-fx-group="score"></div></section></div>''')
    page.evaluate('''() => {const values=new Map(); Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}});}''')
    page.add_script_tag(path=str(ROOT/'static/local-musicxml.js'))
    page.add_script_tag(path=str(ROOT/'static/staff-colors.js'))


def test_catalog_and_no_hidden_menu():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page()
        setup(page)
        result=page.evaluate('''xml=>{
          const catalog=ScoreLocalMusicXML.partCatalog(ScoreLocalMusicXML.parse(xml));
          const meta={id:'aa88aa88-aa88-4aaa-8aaa-aa88aa88aa88',has_score:true,staff_groups:catalog};
          ScoreStaffColors.setProject(meta);
          return {groups:catalog.map(p=>[p.id,p.name,p.staves,p.transpositions]),visible:!document.getElementById('staffColorsList').hidden,rows:[...document.querySelectorAll('#staffColorsList label')].map(el=>el.textContent),heading:!document.querySelector('.score-staff-colors').hidden};
        }''',woodwind_score())
        assert [g[1] for g in result['groups']]==['Oboe','Clarinet in B flat','Bassoon'],result
        assert result['groups'][1][3][0]['semitones']==-2,result
        assert result['visible'] and result['heading'] and len(result['rows'])==3,result
        assert all(key in row for key,row in zip(('P1:1','P2:1','P3:1'),result['rows'])),result
        colors=page.evaluate('''()=>{
          const enable=document.getElementById('staffColorsEnabled');enable.checked=true;enable.dispatchEvent(new Event('change'));
          const first=document.querySelector('#staffColorsList input[data-staff-key="P1:1"]');
          const second=document.querySelector('#staffColorsList input[data-staff-key="P2:1"]');
          first.value='#ff0033';first.dispatchEvent(new Event('input'));
          second.value='#00ff33';second.dispatchEvent(new Event('input'));
          return ScoreStaffColors.getConfig();
        }''')
        assert colors['enabled'] and colors['colors']['P1:1']=='#ff0033' and colors['colors']['P2:1']=='#00ff33',colors
        page.evaluate('''()=>{ScoreStaffColors.setProject({id:'bb88aa88-aa88-4aaa-8aaa-aa88aa88aa88',has_score:true});}''')
        assert page.locator('.score-staff-colors').is_visible()
        assert page.locator('#staffColorsStatus').is_visible()
        assert page.locator('#staffColorsRefresh').is_visible()
        assert page.locator('#staffColorsEnabled').is_disabled()
        browser.close()


def test_legacy_recovery_persists_colors_and_catalog_without_api():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page()
        setup(page)
        result=page.evaluate('''async xml=>{
          const id='11335577-1133-4557-8557-113355771133';
          localStorage.setItem(`scoremotion.staffColors.v1.${id}`,JSON.stringify({enabled:true,colors:{'P2:1':'#aa55ff'}}));
          const url=URL.createObjectURL(new Blob([xml],{type:'application/xml'}));
          const calls=[];
          window.ScoreLocalProjects={setStaffGroups:async(projectId,parts)=>calls.push({projectId,groups:parts.length})};
          window.SCOREMOTION_LOCAL_ONLY=true;
          const meta={id,has_score:true,local_project:true,local_score_url:url,staff_groups:[]};
          ScoreStaffColors.setProject(meta);
          const before=ScoreStaffColors.getConfig();
          const success=await ScoreStaffColors.recoverCatalog(meta);
          const after=ScoreStaffColors.getConfig();
          URL.revokeObjectURL(url);
          return {before,after,success,groups:meta.staff_groups.map(p=>p.name),stored:calls,inputs:[...document.querySelectorAll('#staffColorsList input[type=color]')].map(e=>[e.dataset.staffKey,e.value]),visible:!document.querySelector('.score-staff-colors').hidden};
        }''',woodwind_score())
        assert result['before']['colors']['P2:1']=='#aa55ff',result
        assert result['success'] and result['visible'],result
        assert result['groups']==['Oboe','Clarinet in B flat','Bassoon'],result
        assert result['after']['enabled'] and result['after']['colors']['P2:1']=='#aa55ff',result
        assert result['stored']==[{'projectId':'11335577-1133-4557-8557-113355771133','groups':3}],result
        assert dict(result['inputs'])['P2:1']=='#aa55ff',result
        browser.close()


def test_corrupt_score_keeps_menu_and_reports_error():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page()
        setup(page)
        data=page.evaluate('''async()=>{
          window.SCOREMOTION_LOCAL_ONLY=true;
          const url=URL.createObjectURL(new Blob(['<not-a-score/>'],{type:'application/xml'}));
          const meta={id:'cc88aa88-aa88-4aaa-8aaa-aa88aa88aa88',has_score:true,local_project:true,local_score_url:url};
          ScoreStaffColors.setProject(meta);
          const result=await ScoreStaffColors.recoverCatalog(meta);
          URL.revokeObjectURL(url);
          return {result,visible:!document.querySelector('.score-staff-colors').hidden,status:document.getElementById('staffColorsStatus').textContent};
        }''')
        assert not data['result'] and data['visible'] and data['status'].startswith('악기 목록을 읽지 못했습니다'),data
        browser.close()
