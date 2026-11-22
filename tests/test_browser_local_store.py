"""Browser-only project smoke test with real IndexedDB and no API server."""
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def test_browser_local_store_flow():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.route('https://scoremotion.test/**', lambda route: route.fulfill(body='<html></html>'))
        page.goto('https://scoremotion.test/')
        page.evaluate('''() => {
          window.SCOREMOTION_LOCAL_ONLY = true;
          window.__apiRequests = 0;
          window.fetch = () => { window.__apiRequests++; throw Error('Unexpected network request'); };
        }''')
        for name in ('local-project-codec.js', 'local-projects.js'):
            page.add_script_tag(path=str(ROOT / 'static' / name))

        example = ROOT / 'examples'
        result = page.evaluate('''async ({xml, midi, audio}) => {
          const form = new FormData();
          form.set('score', new File([xml], 'small_morning.musicxml', {type:'application/xml'}));
          form.set('midi', new File([new Uint8Array(midi)], 'small_morning.mid', {type:'audio/midi'}));
          form.set('audio', new File([new Uint8Array(audio)], 'small_morning.wav', {type:'audio/wav'}));
          const created = await ScoreLocalProjects.request('/api/projects', {method:'POST', body:form});
          if (!created.ok) throw Error(await created.text());
          const meta = await created.json();
          const saved = await (await ScoreLocalProjects.request('/api/projects/' + meta.id)).json();
          const score = await ScoreLocalProjects.request('/api/projects/' + meta.id + '/score');
          const effects = await ScoreLocalProjects.request('/api/projects/' + meta.id + '/effect-settings',
            {method:'PUT', body:JSON.stringify({keyboardColorLow:'#ff0000'})});
          const bg = new FormData();
          bg.set('background', new File([new Uint8Array([1,2,3])], 'pic.png', {type:'image/png'}));
          const background = await ScoreLocalProjects.request('/api/projects/' + meta.id + '/background',
            {method:'POST', body:bg});
          const fromDb = await ScoreLocalProjects.openProject(meta.id);
          return {id:meta.id, local:meta.local_project, notes:meta.note_count,
            hasScore:saved.has_score && score.ok && (await score.text()).includes('score-partwise'),
            effectsOk:effects.ok, backgroundOk:background.ok,
            backgroundStored:fromDb.background?.name === 'pic.png', network:window.__apiRequests};
        }''', {
            'xml': (example / 'small_morning.musicxml').read_text(),
            'midi': list((example / 'small_morning.mid').read_bytes()),
            'audio': list((example / 'small_morning.wav').read_bytes()),
        })
        assert len(result['id']) == 32
        assert result['local'] and result['notes'] > 0 and result['hasScore']
        assert result['effectsOk'] and result['backgroundOk'] and result['backgroundStored']
        assert result['network'] == 0
        page.reload()
        page.evaluate('window.SCOREMOTION_LOCAL_ONLY = true')
        for name in ('local-project-codec.js', 'local-projects.js'):
            page.add_script_tag(path=str(ROOT / 'static' / name))
        restored = page.evaluate('''async id => {
          const record = await ScoreLocalProjects.openProject(id);
          return {id:record?.id, background:record?.background?.name,
            effect:record?.meta?.effect_settings?.keyboardColorLow};
        }''', result['id'])
        assert restored == {'id': result['id'], 'background': 'pic.png', 'effect': '#ff0000'}
        browser.close()
