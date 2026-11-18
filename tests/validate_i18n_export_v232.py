"""Browser regression: semantic i18n of dynamically rendered MP4 export UI."""
import json,re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]/'static'
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script[^>]*src=[^>]*></script>','',html)
html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('<head>','<head><base href="http://scorevideo.local/">',1)
app=(ROOT/'app.js').read_text()
assert "document.addEventListener('scorevideo:languagechange',updateExportUi)" in app
start=app.index(' const exportT=')
end=app.index(' const renderEditTargets=',start)
script='''(()=>{
 const $=id=>document.getElementById(id);
 let project={audio_filename:'song.wav',audio_duration_sec:197};
 let offlineSupport={supported:true};
 let renderUiActive=false;
 let exportChoiceExplicit=true;
 let mp4MeasuredFps=0;
 const exportModeKey='scorevideo_mp4_engine_v1';
 const selectedExportMode=()=>document.querySelector('input[name=exportMode]:checked')?.value||'offline';
 let storedMode='offline';
 const localStorage={getItem:()=>storedMode,setItem(k,v){storedMode=v}};
 const fmt=s=>{const t=Math.max(0,Math.floor(Number(s)||0));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`};
''' + app[start:end] + '''
 document.addEventListener('scorevideo:languagechange',updateExportUi);
 window.v232Test={updateExportUi,setMode:v=>{storedMode=v},setProject:p=>{project=p;updateExportUi()}};
 })();'''
packs={x:json.loads((ROOT/'locales'/f'{x}.json').read_text()) for x in ['ko','en','ja']}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html)
 page.evaluate('''packs => {window.fetch=async url=>{
   let code=new URL(url).pathname.split('/').pop().slice(0,2);
   return new Response(JSON.stringify(packs[code]),{status:200,headers:{'Content-Type':'application/json'}})
 };}''',packs)
 page.add_script_tag(content=(ROOT/'i18n.js').read_text())
 page.wait_for_function('ScoreI18n.loaded')
 page.add_script_tag(content=script)
 page.evaluate('''()=>{
   document.querySelector('input[name=exportMode][value=offline]').checked=true;
   document.querySelector('#resolution').value='3840x2160';
   document.querySelector('#fps').value='60';
   document.querySelector('#zoom').value='1.6';
   window.v232Test.updateExportUi();
 }''')
 expected={
 'ko':('150% 이상 악보 확대','고속 오프라인 MP4 시작','출력 예정:'),
 'en':('score zoom of 150% or more','Start high-speed offline MP4','Planned export:'),
 'ja':('楽譜の拡大率150%以上','高速オフライン MP4 を開始','書き出し予定:')}
 for language,(warning,button,summary) in expected.items():
  page.locator('#languageSelect').select_option(language)
  page.wait_for_function('''values=>document.querySelector('#offlineSupportText').textContent.includes(values[0])
    &&document.querySelector('#exportButton').textContent.includes(values[1])
    &&document.querySelector('#selectedEngineSummary').textContent.includes(values[2])''',arg=[warning,button,summary])
  text=page.locator('#offlineSupportText').inner_text()
  assert '3840×2160' in text and '60 fps' in text,text
  assert '$0' not in text
  assert page.locator('#exportEstimate').inner_text()
  assert page.locator('#exportButton span').inner_text()=='↗'
  # Recompute without changing locale; old Korean must never leak back.
  page.evaluate('window.v232Test.updateExportUi()')
  assert warning in page.locator('#offlineSupportText').inner_text()
  assert button in page.locator('#exportButton').inner_text()
  # Switch to compatibility mode: its button must also be translated.
  page.evaluate('''()=>{
    window.v232Test.setMode('legacy');
    document.querySelector('input[name=exportMode][value=legacy]').checked=true;
    window.v232Test.updateExportUi();
  }''')
  labels={'ko':'호환 렌더링 MP4 시작','en':'Start compatible MP4 export','ja':'互換レンダリングで MP4 を開始'}
  assert labels[language] in page.locator('#exportButton').inner_text()
  page.evaluate('''()=>{
    window.v232Test.setMode('offline');
    document.querySelector('input[name=exportMode][value=offline]').checked=true;
     window.v232Test.updateExportUi();
  }''')
 assert not errors,errors
 browser.close()
print('PASS v23.2 export i18n: ko/en/ja 4K60 zoom warning, button, compatibility mode, live updates')
