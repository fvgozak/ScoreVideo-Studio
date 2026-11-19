"""Browser-only unit smoke without HTTP navigation (network is blocked in CI).

Uses in-memory facsimiles for OPFS/IDB to test application data flow; does not
claim that actual browser storage / GPU rendering has been validated.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
MOCKS=r'''
Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});
if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=> '12345678-1234-4123-8123-123456789abc'});
let requests=0;
window.fetch=()=>{requests++;throw Error('User files must never be sent to a network API.');};
window.__getRequests=()=>requests;
window.ScoreBrowserSalamander={durationSeconds:m=>m.midi_duration_sec+1.5};
window.SCOREMOTION_LOCAL_ONLY=true;
const records=new Map(),files=new Map();
const request=(action)=>{const req={result:null,error:null};queueMicrotask(()=>{try{req.result=action();req.onsuccess?.();}catch(e){req.error=e;req.onerror?.();}});return req;};
const db={objectStoreNames:{contains:(k)=>k==='projects'},createObjectStore:()=>{},transaction:()=>({objectStore:()=>({
 get:id=>request(()=>records.get(id)),put:item=>request(()=>{records.set(item.id,item);return item.id;}),delete:id=>request(()=>{records.delete(id);})
})})};
Object.defineProperty(window,'indexedDB',{configurable:true,value:{open:()=>{const result={result:db};queueMicrotask(()=>result.onsuccess?.());return result;}}});
class Directory{constructor(name){this.name=name;this.entries=new Map();}
 async getDirectoryHandle(name,{create=false}={}){if(!this.entries.has(name)&&create)this.entries.set(name,new Directory(name));if(!this.entries.has(name))throw Error('Directory missing');return this.entries.get(name);}
 async getFileHandle(name,{create=false}={}){if(!this.entries.has(name)&&create)this.entries.set(name,new FH());if(!this.entries.has(name))throw Error('File missing');return this.entries.get(name);}
 async removeEntry(name){this.entries.delete(name);}
}
class FH{file=new Blob([]);async getFile(){return this.file;}
 async createWritable(){const chunks=[],self=this;return new WritableStream({write(chunk){chunks.push(chunk);},close(){self.file=new Blob(chunks);}});}}
const rootDir=new Directory('root');
Object.defineProperty(navigator,'storage',{configurable:true,value:{getDirectory:async()=>rootDir}});
'''

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page()
        page.set_content('<!doctype html><html><body></body></html>')
        page.evaluate(MOCKS)
        for name in ['local-midi.js','local-musicxml.js','local-palette.js','local-projects.js']:
            page.add_script_tag(path=str(ROOT/'static'/name))
        example=ROOT/'examples/dream-journey'
        result=page.evaluate('''async ({xml,midi})=>{
           const form=new FormData();form.set('score',new File([xml],'example.musicxml',{type:'application/xml'}));
           form.set('midi',new File([new Uint8Array(midi)],'example.mid',{type:'audio/midi'}));
           const response=await ScoreLocalProjects.request('/api/projects',{method:'POST',body:form});
           const meta=await response.json();if(!response.ok)throw Error(meta.detail);
           const reread=await ScoreLocalProjects.request('/api/projects/'+meta.id);
           const saved=await reread.json();
           const effects=await ScoreLocalProjects.request('/api/projects/'+meta.id+'/effect-settings',
            {method:'PUT',body:JSON.stringify({keyboardColorLow:'#ff0000'})});
           const bgForm=new FormData();bgForm.append('background',new File([new Uint8Array([1,2,3])],'pic.png',{type:'image/png'}));
           const background=await ScoreLocalProjects.request('/api/projects/'+meta.id+'/background',{method:'POST',body:bgForm});
           const bgData=await background.json();
           const after=await (await ScoreLocalProjects.request('/api/projects/'+meta.id)).json();
           const byteCount=after.local_score_url.length;
           const result={id:meta.id,local:meta.local_project,notes:meta.note_count,scoreMatches:meta.score_alignment.matched_notes,
             coverage:meta.score_alignment.coverage,hasAudioFile:!!meta.local_audio_url,hasScore:!!meta.local_score_url,
             scoreBytes:byteCount,saved:!!saved.local_score_url,effectsOk:effects.ok,bgOk:background.ok,
             bgUrl:after.local_background_url?.startsWith('blob:'),networkRequests:__getRequests()};
           return result;
        }''',{'xml':(example/'dream-journey.musicxml').read_text(),
             'midi':list((example/'dream-journey.mid').read_bytes())})
        print(result)
        assert result['notes']==1557
        assert result['scoreMatches']==1542
        assert result['coverage']>=.98
        assert result['local'] and result['hasScore'] and result['saved']
        assert result['effectsOk'] and result['bgOk'] and result['bgUrl']
        # fetch(blob:) is local; this mock blocks it intentionally, so keep it above
        assert result['networkRequests']==0
        browser.close()

def test_browser_local_store_flow():
    run()

if __name__=='__main__':run()
