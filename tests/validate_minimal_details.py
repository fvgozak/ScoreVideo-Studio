"""Palette and polyphony checks against the actual ScoreVideo browser app."""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


base = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
small = '011dd715320d4cf8b75392440b979e5e'
dream = '25686521bdd845809347d6670c54ee7d'
artwork = Path(__file__).resolve().parents[1] / 'data/projects' / dream / 'background.png'
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(small)})")
    page.goto(base+'/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length > 0', timeout=90000)
    page.locator('[data-editor-tab="design"]').click()
    page.locator('#minimalMode').check()
    page.locator('#paletteImageFile').set_input_files(str(artwork))
    page.locator('#paletteResults').wait_for(state='visible', timeout=30000)
    schemes = []
    for button in page.locator('#paletteSchemes .palette-scheme').all():
        name = button.locator('strong').inner_text()
        button.click()
        page.wait_for_function('''() => {
          const s=window.__scoreVideoDebug?.getStage()?.settings;
          return s?.effects.minimalMode && s.effects.ink.toLowerCase()===document.querySelector('#inkColor').value.toLowerCase();
        }''', timeout=90000)
        schemes.append(page.evaluate('''name => {
          const stage=window.__scoreVideoDebug.getStage(), c=stage.follower.colors();
          const weak=window.ScoreStudio.minimalActiveColor(c.accent,c.ink,c.paper,25);
          const strong=window.ScoreStudio.minimalActiveColor(c.accent,c.ink,c.paper,115);
          return {name,paper:c.paper,ink:c.ink,accent:c.accent,weak,strong,different:weak!==strong};
        }''', name))
    assert len(schemes) == 4 and all(s['different'] for s in schemes), schemes
    page.close()

    page = browser.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(dream)})")
    page.goto(base+'/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length > 1000', timeout=90000)
    page.locator('[data-editor-tab="design"]').click()
    page.locator('#minimalMode').check()
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.effects.minimalMode')
    polyphony = page.evaluate('''() => {
      const stage=window.__scoreVideoDebug.getStage(),f=stage.follower,events=f.noteTriggers;
      const group=events.find((note,i)=>events.slice(i+1,i+5).some(next=>
        Math.abs(next.audio-note.audio)<.015 && next.pitch!==note.pitch));
      if(!group)return {found:false,ties:f.tieContinuations.length};
      stage.seek(group.audio+.03);
      const sameTime=f.activeNodes.filter(note=>note.el.classList.contains('score-minimal-active'));
      const distinct=new Set(sameTime.map(note=>note.el));
      const tie=f.tieContinuations.find(note=>note.endAudio-note.audio>.1);
      let tieActive=null;
      if(tie){stage.seek((tie.audio+tie.endAudio)/2);tieActive=Boolean(tie.headEl?.classList.contains('score-minimal-active')||tie.el?.classList.contains('score-minimal-active'));}
      return {found:true,time:group.audio,active:sameTime.length,distinct:distinct.size,
        ties:f.tieContinuations.length,tieActive,hollowPaths:stage.scoreWindow.querySelectorAll('.vf-notehead path[fill="none"]').length};
    }''')
    assert polyphony['found'] and polyphony['distinct'] >= 2, polyphony
    page.close()

    midi_only = '0503fc0cebe847d09fc1f25f5e51fa07'
    page = browser.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(midi_only)})")
    page.goto(base+'/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.piano?.notes?.length > 0', timeout=90000)
    page.locator('[data-editor-tab="design"]').click()
    page.locator('#minimalMode').check()
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.effects.minimalMode')
    midi_state = page.evaluate('''() => {
      const s=window.__scoreVideoDebug.getStage(),p=s.piano,n=p.notes.find(note=>note.audio>.1);
      const key=window.ScorePianoFall.keyLayout.keys.find(item=>item.pitch===n.pitch);
      const projection=window.ScorePianoFall.pianoProjection(p.cameraAt(n.audio),p.canvas.width,p.canvas.height,false);
      const box=p.keyBox(key,projection.left,projection.whiteWidth);
      const ctx=p.canvas.getContext('2d'),x=Math.round(box.x+box.w/2),y=Math.round(projection.keyTop+7);
      s.seek(n.audio-.05);const before=[...ctx.getImageData(x,y,1,1).data];
      s.seek(n.audio+.02);const after=[...ctx.getImageData(x,y,1,1).data];
      return {scoreVisible:s.settings.scoreVisible,stageClass:s.viewport.classList.contains('score-minimal-stage'),
        pianoMinimal:s.settings.piano.minimalMode,before,after};
    }''')
    assert midi_state['stageClass'] and midi_state['pianoMinimal'] and not midi_state['scoreVisible'], midi_state
    assert midi_state['before'] != midi_state['after'], midi_state
    assert not errors, errors
    print(json.dumps({'schemes':schemes,'polyphony':polyphony,'midiOnly':midi_state,'errors':errors}, ensure_ascii=False))
    browser.close()
