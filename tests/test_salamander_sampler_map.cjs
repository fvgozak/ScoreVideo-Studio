const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.resolve(process.argv[2]||'.');
const code=fs.readFileSync(path.join(root,'static/local-projects.js'),'utf8');
const assets=new Set(fs.readdirSync(path.join(root,'static/audio/salamander')).filter(f=>f.endsWith('.mp3')));
assert.strictEqual(assets.size,28,'Expected 28 bundled audio samples');
const found=code.match(/function\s+sampleName\s*\(\s*note\s*\)\s*\{[\s\S]*?\n\}/);
assert(found,'sampleName function not found');
const sampleName=new Function(`${found[0]}; return sampleName;`)();
const names=[];
for(let note=0;note<=127;note++){
 const got=sampleName(note);
 assert(assets.has(got.name),`MIDI ${note} maps to nonexistent ${got.name}`);
 const expectedPitch=12*(Number(got.name.match(/\d+/)[0])+1)+({'C':0,'Ds':3,'Fs':6,'A':9}[got.name.replace(/\d+.mp3$/,'')]);
 assert.strictEqual(got.sourcePitch,expectedPitch,`pitch mismatch for ${got.name}`);
 names.push(got.name);
}
assert.strictEqual(sampleName(99).name,'C7.mp3');
assert.strictEqual(sampleName(102).name,'A7.mp3');
assert(!names.includes('Ds7.mp3')&&!names.includes('Fs7.mp3'));
const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
assert(html.includes('sampler=available28'),'HTML cache bust token missing');
console.log('PASS: 128 MIDI pitches map to existing files; Ds7/Fs7 corrected; cache token set');
