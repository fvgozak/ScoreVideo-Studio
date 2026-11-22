/* ScoreMotion browser-only project API for Cloudflare Pages.
   All uploaded data stays in this browser's IndexedDB. Nothing is POSTed to Pages Functions. */
(function(root){
'use strict';
const params=new URLSearchParams(location.search);
// HTTPS deployments (including custom Pages domains) are browser-only.
// Keep localhost FastAPI backwards-compatible unless explicitly opted in.
const enabled=root.SCOREMOTION_LOCAL_ONLY===true||params.has('browser-local')||!params.has('python-backend')&&location.protocol==='https:'&&!['localhost','127.0.0.1'].includes(location.hostname);
if(!enabled){root.ScoreLocalProjects={enabled:false};return;}
const codec=root.ScoreLocalCodec;
if(!codec)throw Error('ScoreLocalCodec must be loaded before ScoreLocalProjects.');
const nativeFetch=root.fetch.bind(root),memory=new Map(),urls=new Map(),undoRecords=new Map();let dbPromise=null;
const DB='scoremotion-local-projects',STORE='projects',STATE_STORE='projectStates';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const error=(detail,status=400)=>json({detail:String(detail)},status);
function db(){
  if(!('indexedDB' in root))return Promise.reject(Error('IndexedDB가 비활성화되어 프로젝트를 저장할 수 없습니다.'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,2);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});
      if(!req.result.objectStoreNames.contains(STATE_STORE))req.result.createObjectStore(STATE_STORE,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(Error('IndexedDB 업데이트가 차단됐습니다. 다른 ScoreMotion 탭을 닫고 새로고침하세요.'));
  }).catch(e=>{dbPromise=null;throw e;});
  return dbPromise;
}
async function store(record){
  const database=await db();return new Promise((resolve,reject)=>{
    const tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);
    tx.oncomplete=()=>{memory.set(record.id,record);resolve();};tx.onerror=()=>reject(tx.error);
  });
}
async function load(id){
  if(memory.has(id))return memory.get(id);
  const database=await db();return new Promise((resolve,reject)=>{
    const tx=database.transaction([STORE,STATE_STORE],'readonly');
    const recordRequest=tx.objectStore(STORE).get(id),stateRequest=tx.objectStore(STATE_STORE).get(id);
    tx.oncomplete=()=>{
      const record=recordRequest.result||null;
      if(record){
        if(stateRequest.result?.state)record.state=stateRequest.result.state;
        memory.set(id,record);cacheAssets(record);
      }
      resolve(record);
    };
    tx.onerror=()=>reject(tx.error);
  });
}
async function storeWithState(record){
  const database=await db();return new Promise((resolve,reject)=>{
    const tx=database.transaction([STORE,STATE_STORE],'readwrite');
    tx.objectStore(STORE).put(record);
    if(record.state)tx.objectStore(STATE_STORE).put({id:record.id,state:record.state});
    else tx.objectStore(STATE_STORE).delete(record.id);
    tx.oncomplete=()=>{memory.set(record.id,record);resolve();};tx.onerror=()=>reject(tx.error);
  });
}
function assetUrl(id,kind){return urls.get(`${id}:${kind}`)||'';}
function cacheAsset(id,kind,blob){
  const key=`${id}:${kind}`,old=urls.get(key);if(old)URL.revokeObjectURL(old);
  if(blob){urls.set(key,URL.createObjectURL(blob));}else urls.delete(key);
}
function cacheAssets(record){if(record.audio&&!assetUrl(record.id,'audio'))cacheAsset(record.id,'audio',record.audio);
  if(record.background&&!assetUrl(record.id,'background'))cacheAsset(record.id,'background',record.background);}
async function durationFromAudio(blob){
  const url=URL.createObjectURL(blob);const el=new Audio();el.preload='metadata';
  try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(null,Error('오디오 메타데이터를 읽을 수 없습니다.')),25000);
    const finish=(n,e)=>{clearTimeout(timer);el.onloadedmetadata=null;el.onerror=null;e?reject(e):resolve(n);};
    el.onloadedmetadata=()=>finish(el.duration);
    el.onerror=()=>finish(null,Error('지원되지 않거나 손상된 오디오 형식입니다.'));
    el.src=url;el.load();
  });}finally{el.pause();el.removeAttribute('src');el.load();URL.revokeObjectURL(url);}
}
function sampleName(note){
  const anchors=[21,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,93,96,105,108];
  const pitch=anchors.reduce((best,n)=>Math.abs(n-note)<Math.abs(best-note)?n:best,anchors[0]);
  const names=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
  return {name:`${names[pitch%12]}${Math.floor(pitch/12)-1}.mp3`,sourcePitch:pitch};
}
async function generatedPianoAudio(timing){
  const events=timing.note_events;
  if(events.length>12000)throw Error('브라우저 피아노 음원 자동생성은 12,000개 이하의 MIDI 음표를 지원합니다. 오디오를 직접 추가하세요.');
  const duration=Math.min(600,Math.max(timing.midi_duration_sec+3,3));
  if(timing.midi_duration_sec>597)throw Error('10분이 넘는 MIDI는 오디오를 함께 업로드해 주세요.');
  const context=new AudioContext({sampleRate:44100});
  const sources=new Map();
  try{
    const required=new Map();for(const e of events){const s=sampleName(e.pitch);required.set(s.name,s.sourcePitch);}
    for(const [name,pitch] of required){
      const r=await nativeFetch(`/static/audio/salamander/${name}`);
      if(!r.ok)throw Error('Salamander 피아노 샘플이 누락됐습니다: '+name);
      const buffer=await context.decodeAudioData(await r.arrayBuffer());sources.set(name,{buffer,pitch});
    }
  }finally{await context.close();}
  const offline=new OfflineAudioContext(2,Math.ceil(duration*44100),44100);
  for(const event of events){
    const s=sampleName(event.pitch),sample=sources.get(s.name);if(!sample)continue;
    const from=Math.max(0,event.second),until=Math.min(duration,Math.max(from+.08,event.sustain_end_second||event.end_second||from+.5));
    const audio=offline.createBufferSource();audio.buffer=sample.buffer;audio.playbackRate.value=2**((event.pitch-sample.pitch)/12);
    const gain=offline.createGain(),velocity=Math.min(1,Math.max(.06,event.velocity/127));
    gain.gain.setValueAtTime(0,from);gain.gain.linearRampToValueAtTime(.24*velocity,from+.012);
    gain.gain.setValueAtTime(.24*velocity,Math.max(from+.012,until-.09));gain.gain.linearRampToValueAtTime(0,until+.2);
    audio.connect(gain).connect(offline.destination);audio.start(from);audio.stop(Math.min(duration,until+.24));
  }
  const rendered=await offline.startRendering();
  const count=rendered.length,buffer=new ArrayBuffer(44+count*4),view=new DataView(buffer);
  const word=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  word(0,'RIFF');view.setUint32(4,36+count*4,true);word(8,'WAVE');word(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,44100,true);view.setUint32(28,44100*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);
  word(36,'data');view.setUint32(40,count*4,true);
  const a=rendered.getChannelData(0),b=rendered.getChannelData(1);
  for(let i=0;i<count;i++){
    view.setInt16(44+i*4,Math.round(Math.max(-1,Math.min(1,a[i]))*32767),true);
    view.setInt16(46+i*4,Math.round(Math.max(-1,Math.min(1,b[i]))*32767),true);
  }
  return new File([buffer],'Salamander Grand Piano.wav',{type:'audio/wav'});
}
async function createProject(files,{save=true}={}){
  const {score,midi}=files;let {audio}=files;
  if(!midi)throw Error('MIDI 파일이 필요합니다.');
  if(!/\.midi?$/i.test(midi.name))throw Error('MIDI는 .mid 또는 .midi 파일이어야 합니다.');
  if(midi.size>20*1024*1024)throw Error('MIDI 용량은 20MB 이하로 제한됩니다.');
  if(score&&!/\.(xml|musicxml|mxl)$/i.test(score.name))throw Error('MusicXML 확장자를 확인하세요.');
  if(score&&score.size>50*1024*1024)throw Error('MusicXML 용량은 50MB 이하로 제한됩니다.');
  if(audio&&!/\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(audio.name))throw Error('오디오 형식은 WAV/MP3/M4A/AAC/FLAC/OGG를 지원합니다.');
  if(audio&&audio.size>250*1024*1024)throw Error('음원 용량은 250MB 이하로 제한됩니다.');
  const timing=codec.midiTiming(await midi.arrayBuffer());
  let parsed=null,scoreText=null;
  if(score){scoreText=await codec.readScore(score);parsed=codec.decodeScore(scoreText);}
  const generated_audio=!audio;
  if(!audio)audio=await generatedPianoAudio(timing);
  const duration=await durationFromAudio(audio);
  if(!Number.isFinite(duration)||duration<=0||duration>3600)throw Error('오디오 길이를 확인할 수 없습니다.');
  let alignment=null,repeatInfo=parsed?.repeat_info||{mode:'none',warning:''};
  if(parsed){const selected=codec.selectPerformance(scoreText,timing);scoreText=selected.xml;parsed=selected.parsed;alignment=selected.alignment;repeatInfo=selected.repeat_info;}
  const id=crypto.randomUUID().replace(/-/g,'');
  const meta={id,local_project:true,has_score:!!score,generated_midi:false,generated_audio,
    score_name:score?.name||'',musicxml_title:parsed?.title||score?.name.replace(/\.(mxl|xml|musicxml)$/i,'')||midi.name.replace(/\.midi?$/i,''),
    midi_name:midi.name,audio_name:generated_audio?'Salamander Grand Piano':audio.name,audio_filename:generated_audio?'audio.wav':audio.name,
    audio_duration_sec:duration,sync:null,background_filename:null,background_version:null,
    score_alignment:alignment,tie_continuations:parsed?.tieContinuations||[],repeat_info:repeatInfo,
    ...timing};
  const record={id,meta,score:scoreText||null,scoreOriginal:score||null,midi,audio,background:null,paletteSource:null,diagnostics:null,state:null,createdAt:new Date().toISOString()};
  if(save){await store(record);cacheAssets(record);return meta;}
  return record;
}
function svgPalette(colors){
  const main=colors.main,secondary=colors.secondary,shadow=colors.shadow;
  const schemes=[
    {id:'paper',name:'Gallery Paper',description:'가독성 높은 밝은 악보',paper:'#f9f8f2',background:'#eaeef0',ink:'#172129',staff:'#4a5055',accent:main,glow:secondary,panel:'#f9f8f2',panel_opacity:.68},
    {id:'dark',name:'Midnight',description:'사진에 어울리는 어두운 악보',paper:'#111722',background:'#0c1020',ink:'#f5f6fc',staff:'#abb7c8',accent:secondary,glow:main,panel:'#141a23',panel_opacity:.83},
    {id:'muted',name:'Soft Canvas',description:'절제된 색감과 따뜻한 질감',paper:'#f1e9de',background:'#d9dfdc',ink:'#263136',staff:'#59636a',accent:main,glow:secondary,panel:'#f1e9de',panel_opacity:.72},
    {id:'vivid',name:'Vivid Contrast',description:'선명한 음표와 색채 대비',paper:'#1b1932',background:'#110f22',ink:'#fafaff',staff:'#c7bfd9',accent:secondary,glow:main,panel:'#211d35',panel_opacity:.83}
  ];
  return {palette:[{name:'기본',hex:main},{name:'강조',hex:secondary},{name:'그림자',hex:shadow}],primary:main,
    schemes:schemes.map(s=>({id:s.id,name:s.name,description:s.description,panel_opacity:s.panel_opacity,
      colors:{paper:s.paper,background:s.background,ink:s.ink,staff:s.staff,accent:s.accent,glow:s.glow,cursor:s.accent,
        panel:s.panel,trail_upper:s.glow,trail_lower:s.accent,aurora_low:main,aurora_high:secondary}}))};
}
async function paletteFromFile(file){
  const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,80,80);bitmap.close?.();
  const rgba=ctx.getImageData(0,0,80,80).data,bins=new Map();
  for(let i=0;i<rgba.length;i+=4){const [r,g,b,a]=rgba.slice(i,i+4);if(a<80||Math.max(r,g,b)<35||Math.min(r,g,b)>238)continue;
    const bin=[r,g,b].map(c=>Math.min(255,Math.round(c/32)*32));const key=bin.join(',');bins.set(key,(bins.get(key)||0)+1);}
  const palette=[...bins].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([value])=>'#'+value.split(',').map(c=>Number(c).toString(16).padStart(2,'0')).join(''));
  const main=palette[0]||'#4754a8',secondary=palette[1]||'#48b6c7',shadow=palette[2]||'#1e274f';
  const result=svgPalette({main,secondary,shadow});
  result.palette=palette.map((hex,i)=>({name:`대표색 ${i+1}`,hex}));return result;
}
// ScoreMotion first-sound sync v3: stereo + adaptive onset
// Adaptive stereo audio onset detection; MIDI timeline remains unchanged.
function firstSoundPercentile(values, q){
  if(!values.length)return 0;
  const sorted=Array.from(values).sort((a,b)=>a-b);
  const pos=(sorted.length-1)*Math.max(0,Math.min(1,q));
  const index=Math.floor(pos),fraction=pos-index;
  return sorted[index]*(1-fraction)+(sorted[Math.min(index+1,sorted.length-1)]||0)*fraction;
}
function detectFirstAudioSound(buffer,firstMidi=0){
  const sampleRate=buffer.sampleRate,channels=Math.min(2,buffer.numberOfChannels||1);
  const hop=Math.max(1,Math.round(sampleRate*.004));
  const searchSeconds=Math.min(60,Math.max(18,firstMidi+14));
  const limit=Math.min(buffer.length,Math.round(sampleRate*searchSeconds));
  const count=Math.floor(limit/hop);
  if(count<20)throw Error('첫 소리를 분석하기에 음원이 너무 짧습니다.');
  const samples=Array.from({length:channels},(_,ch)=>buffer.getChannelData(ch));
  const rms=new Float32Array(count),smooth=new Float32Array(count);
  for(let i=0;i<count;i++){
    const from=i*hop;let maxRms=0;
    for(const channel of samples){
      let sum=0;
      for(let j=from;j<from+hop;j++){const x=channel[j];sum+=x*x;}
      maxRms=Math.max(maxRms,Math.sqrt(sum/hop));
    }
    rms[i]=maxRms;
    // Causal smoothing; never move an onset earlier using future samples.
    smooth[i]=.55*maxRms+.30*(i?rms[i-1]:0)+.15*(i>1?rms[i-2]:0);
  }
  const n4=Math.min(count,Math.ceil(4*sampleRate/hop));
  const peak=Math.max(firstSoundPercentile(smooth.subarray(0,n4),.98),
    firstSoundPercentile(smooth,.98)*.25);
  if(peak<.00008)throw Error('음원에서 충분한 신호를 찾지 못했습니다.');
  const initialWindow=Math.min(count,Math.max(5,Math.round(.15*sampleRate/hop)));
  const floor=firstSoundPercentile(rms.subarray(0,initialWindow),.25);
  const earlyGate=Math.max(.000055,peak*.00065,floor<peak*.22?floor*2.7:0);
  const minRun=Math.max(5,Math.round(.024*sampleRate/hop));
  let candidate=-1,consecutive=0;
  for(let i=0;i<count;i++){
    if(smooth[i]>=earlyGate){
      consecutive++;
      if(consecutive>=minRun){candidate=i-consecutive+1;break;}
    }else consecutive=0;
  }
  if(candidate<0)throw Error('음원의 첫 유효한 소리를 찾지 못했습니다.');
  // Quiet note from time zero: initial piano energy is also counted in
  // "noise floor". Do not wait for the next forte chord in that case.
  const firstMedian=firstSoundPercentile(smooth.subarray(0,Math.min(count,minRun*3)),.5);
  const earlyBase=firstSoundPercentile(rms.subarray(0,Math.min(count,4)),.5);
  const earlyBody=firstSoundPercentile(rms.subarray(Math.min(count,16),Math.min(count,32)),.5);
  const initialGrowth=earlyBody/Math.max(earlyBase,1e-7);
  // Do not mistake stationary hum for a note beginning at t=0.
  const zeroStart=firstMedian>=Math.max(.00010,peak*.0014) && initialGrowth>=1.65;
  if(zeroStart)candidate=0;
  const lowGate=Math.max(.000025,peak*.0003,floor<peak*.22?floor*1.3:0);
  const lookback=Math.round(.24*sampleRate/hop);
  let start=candidate,gaps=0;
  for(let i=candidate-1;i>=Math.max(0,candidate-lookback);i--){
    if(smooth[i]>=lowGate){start=i;gaps=0;}
    else if(++gaps>=2)break;
  }
  // A few soundless frames may precede the first audible energy.
  const firstAudio=Math.round(start*hop/sampleRate*10000)/10000;
  const relative=firstMedian/Math.max(peak,1e-9);
  const ambiguous=zeroStart&&relative<.004 || floor>peak*.7;
  return {
    first_audio_sec:firstAudio,
    signal_contrast:Math.round(peak/Math.max(floor,.000001)*100)/100,
    confidence:ambiguous?'low':'estimated',
    analysis_seconds:Math.round(limit/sampleRate*100)/100,
    detection_threshold:Math.round(earlyGate*1e7)/1e7,
    channels_analyzed:channels
  };
}
async function autoSync(record){
  const firstMidi=Number(record.meta.note_events?.[0]?.second??0);
  const last=Math.max(firstMidi+.001,Number(record.meta.note_events?.at(-1)?.second??record.meta.midi_duration_sec??1));
  if(record.meta.generated_audio)return {method:'first-sound-offset',analysis_version:3,offset_sec:0,tempo_ratio:1,correlation:0,
    signal_contrast:0,first_midi_sec:firstMidi,first_audio_sec:firstMidi,anchors:[{midi:0,audio:0},{midi:last,audio:last}],note_events:record.meta.note_count,analysis_seconds:0,
    confidence:'generated'};
  const ctx=new AudioContext();let buffer;
  try{buffer=await ctx.decodeAudioData(await record.audio.arrayBuffer());}finally{await ctx.close();}
  const result=detectFirstAudioSound(buffer,firstMidi);
  const shift=Math.round((result.first_audio_sec-firstMidi)*10000)/10000;
  return {method:'first-sound-offset',analysis_version:3,offset_sec:shift,tempo_ratio:1,correlation:0,
    ...result,first_midi_sec:firstMidi,
    anchors:[{midi:0,audio:shift},{midi:last,audio:last+shift}],note_events:record.meta.note_count};
}

async function saveState(id,state){
  const record=await load(id);if(!record)throw Error('프로젝트가 존재하지 않습니다.');
  const saved=structuredClone(state),database=await db();
  await new Promise((resolve,reject)=>{
    const tx=database.transaction(STATE_STORE,'readwrite');tx.objectStore(STATE_STORE).put({id,state:saved});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  record.state=saved;
}
async function savePaletteSource(id,file){
  const record=await load(id);if(!record)throw Error('프로젝트가 존재하지 않습니다.');
  if(file&&(!(file instanceof Blob)||file.size>20*1024*1024))throw Error('팔레트 이미지 용량 제한을 초과했습니다.');
  record.paletteSource=file||null;await store(record);
}
async function forget(id){
  const database=await db();await new Promise((resolve,reject)=>{
    const tx=database.transaction([STORE,STATE_STORE],'readwrite');
    tx.objectStore(STORE).delete(id);tx.objectStore(STATE_STORE).delete(id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });memory.delete(id);for(const kind of ['audio','background'])cacheAsset(id,kind,null);undoRecords.delete(id);
}
async function importRecord(candidate){
  if(!candidate?.meta||!candidate.midi||!candidate.audio)throw Error('복원할 프로젝트 데이터가 없습니다.');
  const oldId=candidate.id;let copied=false;
  if(await load(oldId)){
    copied=true;candidate.id=crypto.randomUUID().replace(/-/g,'');
    candidate.meta={...candidate.meta,id:candidate.id};
    candidate.state={...candidate.state,extensions:{...(candidate.state?.extensions||{}),forked_from_project_id:oldId}};
  }
  await storeWithState(candidate);cacheAssets(candidate);return {meta:candidate.meta,copied,id:candidate.id};
}
async function replaceAsset(id,role,file){
  if(!['score','midi','audio','background','palette_source'].includes(role)||!(file instanceof Blob))throw Error('파일 교체 대상이 올바르지 않습니다.');
  const record=await load(id);if(!record)throw Error('프로젝트가 없습니다.');
  let updated;
  if(role==='background'||role==='palette_source'){
    if(file.size>20*1024*1024||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('PNG/JPEG/WebP 이미지, 20MB 이하만 지원합니다.');
    updated={...record,meta:{...record.meta}};
    if(role==='background'){updated.background=file;updated.meta.background_filename=file.name||'background.png';updated.meta.background_version=Date.now();updated.meta.background_original_name=file.name||'background.png';}
    else updated.paletteSource=file;
  }else{
    const source=record.scoreOriginal||(record.score&&new File([record.score],record.meta.score_name?.replace(/\.mxl$/i,'.musicxml')||'legacy.musicxml',{type:'application/xml'}));
    const oldAudio=record.meta.generated_audio?null:record.audio;
    const inputs={score:role==='score'?file:source,midi:role==='midi'?file:record.midi,
      audio:role==='audio'?file:role==='midi'&&record.meta.generated_audio?null:record.audio};
    updated=await createProject(inputs,{save:false});
    updated.id=id;updated.meta.id=id;
    if(role==='score')updated.meta.generated_audio=record.meta.generated_audio;
    updated.meta.effect_settings=record.meta.effect_settings;
    updated.meta.sync=record.meta.sync;
    updated.background=record.background;updated.paletteSource=record.paletteSource;
    updated.createdAt=record.createdAt;
    updated.state=structuredClone(record.state||{});
    if(updated.state.timeline?.synchronization){
      updated.state.timeline.synchronization.review_state='needs-review';
      updated.state.timeline.synchronization.midi_to_audio=record.meta.sync||updated.state.timeline.synchronization.midi_to_audio||null;
    }
    if(updated.state.timeline?.camera)updated.state.timeline.camera.review_state='needs-review';
  }
  if(role==='background'||role==='palette_source')updated.state=record.state;
  undoRecords.set(id,record);
  try{await storeWithState(updated);cacheAsset(id,'audio',updated.audio);cacheAsset(id,'background',updated.background);}catch(error){undoRecords.delete(id);throw error;}
  return {meta:updated.meta,role,reviewRequired:['score','midi','audio'].includes(role)};
}
async function undoReplace(id){
  const previous=undoRecords.get(id);if(!previous)throw Error('되돌릴 파일 교체 기록이 없습니다.');
  await storeWithState(previous);cacheAsset(id,'audio',previous.audio);cacheAsset(id,'background',previous.background);undoRecords.delete(id);return previous.meta;
}
async function apiFetch(input,init={}){
  const request=input instanceof Request?input:null;
  const url=new URL(request?.url||input,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,init);
  const method=(init.method||request?.method||'GET').toUpperCase(),path=url.pathname;
  const body=()=>init.body||request;
  try{
    if(path==='/api/projects'&&method==='POST'){
      const form=init.body instanceof FormData?init.body:await request.formData();
      return json(await createProject({score:form.get('score'),midi:form.get('midi'),audio:form.get('audio')}));
    }
    if(path==='/api/palette/themes'){
      const palette={space:['#4754a8','#8e5ec9','#1e274f'],sea:['#247ba0','#48b6c7','#0f3b60'],forest:['#367a55','#94ba62','#1f4536'],wood:['#9a6640','#c99661','#593a2d']};
      const values=palette[url.searchParams.get('theme')||'space'];return values?json(svgPalette({main:values[0],secondary:values[1],shadow:values[2]})):error('알 수 없는 색상 테마');
    }
    if(path==='/api/palette/extract'&&method==='POST'){
      const form=init.body instanceof FormData?init.body:await request.formData();const image=form.get('image');
      if(!(image instanceof Blob))return error('이미지가 없습니다.');if(image.size>20*1024*1024)return error('이미지는 20MB 이하로 업로드해 주세요.',413);
      return json(await paletteFromFile(image));
    }
    const match=path.match(/^\/api\/projects\/([a-f0-9]{32})(?:\/(.+))?$/);
    if(!match)return error('Browser-only mode: unsupported API',404);
    const id=match[1],action=match[2]||'',record=await load(id);if(!record)return error('프로젝트를 찾지 못했습니다.',404);
    if(method==='GET'&&!action)return json(record.meta);
    if(method==='GET'&&(action==='score'||action==='audio'||action==='background')){
      const blob=record[action];if(!blob)return error('파일이 없습니다.',404);
      return new Response(action==='score'?blob:new Blob([blob],{type:blob.type||'application/octet-stream'}),{headers:{'Content-Type':action==='score'?'application/xml;charset=utf-8':blob.type||'application/octet-stream','Cache-Control':'no-store'}});
    }
    if(action==='effect-settings'&&method==='PUT'){
      const settings=await (request||new Request(url,{method,body:init.body,headers:init.headers})).json();
      record.meta.effect_settings=settings;await store(record);return json({saved:true});
    }
    if(action==='render-diagnostics'){
      if(method==='GET')return record.diagnostics?json(record.diagnostics):error('No diagnostics',404);
      if(method==='POST'){record.diagnostics=await (request||new Request(url,{method,body:init.body,headers:init.headers})).json();await store(record);return json({saved:true});}
    }
    if(action==='background'&&method==='POST'){
      const form=init.body instanceof FormData?init.body:await request.formData(),file=form.get('background');
      if(!(file instanceof Blob))return error('배경 이미지가 없습니다.');
      if(file.size>20*1024*1024||!/^image\/(png|jpeg|webp)$/.test(file.type))return error('배경은 PNG/JPEG/WebP, 20MB 이하만 지원합니다.');
      record.background=file;record.meta.background_filename=file.name||'background.png';record.meta.background_version=Date.now();record.meta.background_original_name=file.name||'background.png';
      await store(record);cacheAsset(id,'background',file);
      return json({background_filename:record.meta.background_filename,background_version:record.meta.background_version,
        background_original_name:record.meta.background_original_name,url:assetUrl(id,'background')});
    }
    if(action==='background'&&method==='DELETE'){
      record.background=null;record.meta.background_filename=null;record.meta.background_version=null;record.meta.background_original_name=null;
      await store(record);cacheAsset(id,'background',null);return json({background_filename:null});
    }
    if(action==='auto-sync'&&method==='POST'){
      const sync=await autoSync(record);record.meta.sync=sync;await store(record);return json(sync);
    }
    if(action==='auto-sync'&&method==='DELETE'){
      record.meta.sync=null;await store(record);return json({sync:null});
    }
    if(action==='status'&&method==='GET')return json({state:'idle'});
    if(action==='render'&&method==='POST')return error('브라우저 모드에서는 고속 WebCodecs MP4 출력을 선택하세요.',501);
    if(action==='salience'||action==='salience/reweight')return error('브라우저 모드에서는 자동 프레이즈 분석이 아직 지원되지 않습니다.',501);
    return error('브라우저 모드에서 지원하지 않는 API: '+action,404);
  }catch(e){console.warn('ScoreMotion local API:',e);return error(e.message||e,400);}
}
root.fetch=apiFetch;
root.ScoreLocalProjects={enabled:true,assetUrl,openProject:load,createProject,codec,request:apiFetch,generateAudio:generatedPianoAudio,
  saveState,savePaletteSource,importRecord,replaceAsset,undoReplace,forget,validateAudio:durationFromAudio,
  async setStaffGroups(id,groups){
    const record=await load(id);if(!record)throw Error('프로젝트를 찾지 못했습니다.');
    record.meta.staff_groups=groups;await store(record);return groups;
  }};
})(window);
