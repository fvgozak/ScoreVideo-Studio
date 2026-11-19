"""Real MusicXML/MIDI/OSMD integration: staff tags survive into piano MIDI events."""
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]

def test_score_to_piano_midi_staff_links():
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=b.new_page(viewport={'width':1500,'height':850})
        page.set_content('<div id="view" style="height:730px;width:1320px;overflow:auto"><div id="sheet" style="width:1270px"></div></div>')
        for f in ('vendor/opensheetmusicdisplay.min.js','local-midi.js','local-musicxml.js','studio-scene.js','staff-colors.js','score-core.js','piano-fall.js'):
            page.add_script_tag(path=str(R/'static'/f))
        data=page.evaluate('''async ({xml,midi})=>{
            window.loadOSMD=async()=>{};
            const timing=ScoreLocalMidi.parse(new Uint8Array(midi).buffer);
            const prep=await ScoreLocalMusicXML.prepare(new File([xml],'dream.musicxml'),timing);
            const url=URL.createObjectURL(new Blob([prep.score],{type:'text/xml'}));
            try{
                const pal={enabled:true,keyboard:true,colors:{'P1:1':'#ff0000','P1:2':'#0000ff'}};
                const follower=new ScoreFollower({container:document.getElementById('sheet'),viewport:document.getElementById('view'),
                  tempoMap:timing.tempo_map,noteEvents:timing.note_events,scoreAlignment:prep.alignment,staffGroups:prep.staff_groups,tieContinuations:prep.tie_continuations,effects:{staffColors:pal}});
                await follower.load(url);
                const piano=Object.create(ScorePianoFall.PianoFall.prototype);
                piano.notes=[];piano.settings={portrait:false,offsetSec:0};
                piano.setFollower(follower);
                const matched=piano.notes.filter(n=>n.staffKeys?.length);
                const freq={};for(const n of matched)for(const key of n.staffKeys)freq[key]=(freq[key]||0)+1;
                const colored=piano.notes.filter(n=>n.staffColor);
                const example=colored.slice(0,4).map(n=>({pitch:n.pitch,keys:n.staffKeys,color:n.staffColorHex}));
                piano.updateStaffColors({enabled:true,keyboard:false,colors:pal.colors});
                return {total:piano.notes.length,matched:matched.length,counts:freq,colored:colored.length,example,
                   disabled:piano.notes.every(n=>!n.staffColor)};
            }finally{URL.revokeObjectURL(url);}
        }''',{'xml':(R/'examples/dream-journey/dream-journey.musicxml').read_text(),
            'midi':list((R/'examples/dream-journey/dream-journey.mid').read_bytes())})
        assert data['matched']>1300,data
        assert data['counts'].get('P1:1',0)>500,data
        assert data['counts'].get('P1:2',0)>250,data
        assert data['colored']==data['matched'] and data['disabled'],data
        print(data)
        b.close()
