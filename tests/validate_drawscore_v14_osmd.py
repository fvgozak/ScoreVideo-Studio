"""Real OSMD/VexFlow SVG classification regression with a bundled MusicXML example."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  page=await browser.new_page(viewport={'width':1280,'height':720})
  await page.set_content('<div id="container" style="width:3000px"></div>')
  await page.add_script_tag(path=str(ROOT/'static/vendor/opensheetmusicdisplay.min.js'))
  await page.add_script_tag(path=str(ROOT/'static/score-core.js'))
  xml=(ROOT/'examples/small_morning.musicxml').read_text()
  result=await page.evaluate('''async xml => {
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(document.getElementById('container'),{
      backend:'svg',autoResize:false,drawTitle:false,drawComposer:false,followCursor:false,
      renderSingleHorizontalStaffline:true,newSystemFromXML:false,newSystemFromNewPageInXML:false,newPageFromXML:false
    });
    await osmd.load(xml);osmd.zoom=.9;osmd.render();
    const c=document.getElementById('container'),svg=c.querySelector('svg');
    const paths=[...svg.querySelectorAll('.vf-measure>path[fill="none"]')];
    const fiveStaffPaths=paths.filter(el => {
       const box=el.getBoundingClientRect();return box.width>6 && box.height<3;
    });
    const notes=[...svg.querySelectorAll('.vf-notehead path')];
    const stems=[...svg.querySelectorAll('.vf-stem path')];
    const ledgers=[...svg.querySelectorAll('.vf-ledgers path')];
    const follower={container:c,viewport:c,noteTriggers:[{systemKey:0,noteY:125,audio:0},{systemKey:0,noteY:135,audio:1}]};
    ScoreFollower.prototype.prepareDrawing.call(follower);
    return {staffPaths:fiveStaffPaths.length,staffTagged:svg.querySelectorAll('[data-score-staff-line]').length,
      notes:notes.length,noteTagged:notes.filter(n=>n.hasAttribute('data-score-draw-item')).length,
      stems:stems.length,stemsTagged:stems.filter(n=>n.hasAttribute('data-score-draw-item')).length,
      ledgerCount:ledgers.length,ledgerTagged:ledgers.filter(n=>n.hasAttribute('data-score-draw-item')).length,
      rows:follower.drawSystems.length,drawable:follower.drawItems.length};
  }''',xml)
  print(result)
  assert result['staffPaths']>=15
  assert result['staffTagged']==result['staffPaths'], 'All OSMD staff strokes should remain permanently visible'
  assert result['noteTagged']==result['notes']>0
  assert result['stemsTagged']==result['stems']>0
  assert result['ledgerTagged']==result['ledgerCount']
  print('PASS: actual OSMD short/long staff strokes and all glyph types classified correctly')
  await browser.close()
asyncio.run(main())
