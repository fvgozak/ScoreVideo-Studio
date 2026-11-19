from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
def test_real_score_staff_colors():
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=b.new_page(viewport={'width':1500,'height':850})
  page.set_content('''<style>html,body{margin:0}.viewer{height:730px;width:1320px;overflow:auto}.sheet{width:1270px}</style><div class="viewer" id="view"><div class="sheet" id="sheet"></div></div>''')
  for f in ['vendor/opensheetmusicdisplay.min.js','local-midi.js','local-musicxml.js','studio-scene.js','staff-colors.js','score-core.js']:
   page.add_script_tag(path=str(R/'static'/f))
  result=page.evaluate('''async({xml,midi})=>{
     window.loadOSMD=async()=>{};
     const timing=ScoreLocalMidi.parse(new Uint8Array(midi).buffer);
     const prep=await ScoreLocalMusicXML.prepare(new File([xml],'dream.musicxml'),timing);
     const object=URL.createObjectURL(new Blob([prep.score],{type:'text/xml'}));
     try{
       const follower=new ScoreFollower({container:document.getElementById('sheet'),viewport:document.getElementById('view'),
         tempoMap:timing.tempo_map,noteEvents:timing.note_events,scoreAlignment:prep.alignment,staffGroups:prep.staff_groups,tieContinuations:prep.tie_continuations,
         effects:{staffColors:{enabled:true,colors:{'P1:1':'#e00000','P1:2':'#00e000'}}}});
       await follower.load(object);
       const unique=[...new Set(follower.noteTriggers.map(n=>n.groupKey))];
       const samples=follower.noteTriggers.filter(n=>n.groupKey).slice(0,5);
       return {matched:prep.alignment.matched_notes,triggers:follower.noteTriggers.length,groups:unique,
         counts:unique.map(key=>[key,follower.noteTriggers.filter(n=>n.groupKey===key).length]),colors:samples.map(n=>follower.eventLightColor(n.velocity,n)),first:samples.map(n=>({pitch:n.pitch,group:n.groupKey}))};
     }finally{URL.revokeObjectURL(object);}
   }''',{'xml':(R/'examples/dream-journey/dream-journey.musicxml').read_text(),
         'midi':list((R/'examples/dream-journey/dream-journey.mid').read_bytes())})
  print(result)
  assert set(result['groups'])=={'P1:1','P1:2'},result
  assert result['triggers']>1200,result
  b.close()
