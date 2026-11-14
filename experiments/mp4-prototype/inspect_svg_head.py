"""Inspect one VexFlow notehead and its SVG transforms in the live stage."""
import json
import sys

from playwright.sync_api import sync_playwright


project_id = sys.argv[1]
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.goto('http://127.0.0.1:8766/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length>1000',
                           timeout=90000)
    result = page.evaluate('''() => {
        const stage=window.__scoreVideoDebug.getStage();
        const item=stage.follower.noteTriggers.find(n=>n.pitch===86&&Math.abs(n.audio-3.681821)<.001);
        const head=item.headEl,svg=head.ownerSVGElement,chain=[];
        let el=head;
        while(el&&el!==svg){chain.push({tag:el.tagName,class:el.getAttribute('class'),
            transform:el.getAttribute('transform'),style:el.getAttribute('style'),
            html:el===head?el.outerHTML.slice(0,1600):null});el=el.parentElement;}
        const r=head.getBoundingClientRect(),sr=svg.getBoundingClientRect();
        return {headRect:{x:r.x,y:r.y,w:r.width,h:r.height},
            svgRect:{x:sr.x,y:sr.y,w:sr.width,h:sr.height},viewBox:svg.getAttribute('viewBox'),
            svgWidth:svg.getAttribute('width'),svgHeight:svg.getAttribute('height'),chain};
    }''')
    print(json.dumps(result, indent=2))
    browser.close()
