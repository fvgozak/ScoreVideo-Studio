import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const base=path.resolve(process.argv[2]||path.join(import.meta.dirname,'..')),dir=path.join(base,'examples','dream-journey');
// Test adapter: Python stdlib XML parser supplies the minimal DOM operations
// used by the real browser decodeScore implementation. No Python in service.
const py=`import json,sys,xml.etree.ElementTree as E\ndef tree(n):return [n.tag.split('}')[-1],n.attrib,n.text or '',[tree(c) for c in n]]\nprint(json.dumps(tree(E.parse(sys.argv[1]).getroot())))`;
const data=JSON.parse(execFileSync('python3',['-c',py,path.join(dir,'dream-journey.musicxml')],{maxBuffer:16*1024*1024}));
function node([name,attrs,text,children]){const c=children.map(node);return {localName:name,children:c,textContent:text+c.map(n=>n.textContent).join(''),getAttribute:k=>attrs[k]??null,hasAttribute:k=>k in attrs,getElementsByTagName(tag){return c.flatMap(n=>[...(tag==='*'||n.localName===tag?[n]:[]),...n.getElementsByTagName(tag)]);}};}
const ctx={console,DOMParser:class{parseFromString(){return {documentElement:node(data),querySelector:()=>null};}}};ctx.window=ctx;ctx.self=ctx;vm.createContext(ctx);
for(const f of ['score-alignment-v2.js','local-project-codec.js'])vm.runInContext(fs.readFileSync(path.join(base,'static',f),'utf8'),ctx);
const c=ctx.ScoreLocalCodec,score=c.decodeScore(''),midi=c.midiTiming(fs.readFileSync(path.join(dir,'dream-journey.mid')));assert.equal(midi.note_count,1557);assert.ok(score.measureStarts.length>20);
for(const mode of ['v1','v2a','v2b','v2c','auto']){const a=c.alignScore(score,midi,mode);assert.ok(a.matched_notes>1000,`${mode} too few matches`);assert.ok(a.anchors.every((p,i)=>!i||p.beat>a.anchors[i-1].beat&&p.second>a.anchors[i-1].second));console.log(`Dream Journey ${mode}: ${a.method}; ${a.matched_notes}/${a.total_notes}, group/note coverage ${(100*a.coverage).toFixed(2)}%; status ${a.status}`);}
console.log('PASS real example: MusicXML decode and all five alignment modes (coverage, not annotated accuracy)');
