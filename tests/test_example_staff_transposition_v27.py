"""v27: manifest-only Cloudflare demo and written/concert pitch tests.

Uses local Chromium scripts without network traffic. Does not pretend to be a
full audio+video export GPU end-to-end validation.
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright
from scripts.build_cloudflare_local import build

ROOT=Path(__file__).resolve().parents[1]


def score(part='Clarinet', chromatic=-2):
    tr=f'<transpose><diatonic>-1</diatonic><chromatic>{chromatic}</chromatic></transpose>'
    return f'''<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>{part}</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>{tr}</attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
<note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
<note><rest/><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>'''


def test_transpose_modes_and_staff_colors():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page()
        page.set_content('<html><body><div class="panel"><div class="fx-quick-group" data-fx-group="score"></div></div></body></html>')
        page.add_script_tag(path=str(ROOT/'static/local-musicxml.js'))
        page.add_script_tag(path=str(ROOT/'static/staff-colors.js'))
        js='''async ({xml,pitches})=>{
          const notes=pitches.map((pitch,i)=>({pitch,second:i*.5,end_second:(i+.7)*.5,beat:i,velocity:88}));
          const timing={note_events:notes,note_count:notes.length};
          const prepared=await ScoreLocalMusicXML.prepare(new File([xml],'clarinet.musicxml'),timing);
          const scoreNotes=ScoreLocalMusicXML.scoreNotes(ScoreLocalMusicXML.parse(xml));
          return {mode:prepared.alignment.pitch_mode,coverage:prepared.alignment.coverage,
            matched:prepared.alignment.matched_notes,notes:scoreNotes.attacks.map(n=>n.pitch),
            catalog:prepared.staff_groups,normal:ScoreStaffColors.normalize({enabled:true,colors:{'P1:1':'#778899','XXX':'#ff00ff'}},prepared.staff_groups),
            group:ScoreStaffColors.resolveStaff({Id:1,ParentInstrument:{Id:'P1'}},[],prepared.staff_groups)};
        }'''
        concert=page.evaluate(js,{'xml':score(),'pitches':[70,72,74]})
        assert concert['mode']=='concert',concert
        assert concert['notes']==[70,72,74],concert
        assert concert['matched']==3,concert
        assert concert['catalog'][0]['transpositions']==[{'measure':0,'staff':0,'semitones':-2}]
        assert concert['normal']['colors']=={'P1:1':'#778899'},concert
        assert concert['group']['key']=='P1:1',concert
        written=page.evaluate(js,{'xml':score(),'pitches':[72,74,76]})
        assert written['mode']=='written',written
        assert written['matched']==3,written
        browser.close()


def test_real_osmd_staff_mapping_and_written_pitch():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1400,'height':800})
        page.set_content('<div id="score" style="width:1300px;height:700px"></div>')
        page.add_script_tag(path=str(ROOT/'static/vendor/opensheetmusicdisplay.min.js'))
        page.add_script_tag(path=str(ROOT/'static/staff-colors.js'))
        result=page.evaluate('''async text=>{
          const osmd=new opensheetmusicdisplay.OpenSheetMusicDisplay(document.getElementById('score'),{backend:'svg',autoResize:false,drawTitle:false,followCursor:false});
          await osmd.load(text);osmd.render();
          const instrument=osmd.Sheet.Instruments[0],staves=instrument.Staves;
          return {mapped:staves.map(s=>ScoreStaffColors.resolveStaff(s,osmd.Sheet.Instruments,[{id:'P1',name:'Piano',part_index:0,staves:2}]).key),ids:staves.map(s=>s.Id)};
        }''',(ROOT/'examples/dream-journey/dream-journey.musicxml').read_text())
        assert result['mapped']==['P1:1','P1:2'],result
        browser.close()


def test_cloudflare_demo_is_only_score_midi(tmp_path):
    dist=tmp_path/'pages';build(dist)
    assert (dist/'examples/manifest.json').exists()
    manifest=json.loads((dist/'examples/manifest.json').read_text())
    for item in manifest['examples']:
        files={f.name for f in (dist/'examples'/item['id']).iterdir()}
        assert files=={item['score'],item['midi']},files
    assert not list((dist/'examples').rglob('*.mp3'))
    assert not list((dist/'examples').rglob('*.png'))
    assert (dist/'static/staff-colors.js').exists()
    assert (dist/'static/staff-colors.css').exists()
