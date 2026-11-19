/* ScoreMotion Local-First project repository.
 * Never POST user files to a network API. OPFS owns binary assets and
 * IndexedDB owns searchable metadata; the browser's origin owns both.
 * This module is loaded in both builds, but only active in the local-only build.
 */
(function(root){
 'use strict';
 const enabled=root.SCOREMOTION_LOCAL_ONLY===true||new URLSearchParams(root.location?.search||'').get('client')==='1';
 const dbName='scoremotion-client-projects-v1',rootName='scoremotion-projects';
 const urls=new Map();let dbPromise=null,dirPromise=null;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const mime={'.xml':'application/xml','.musicxml':'application/xml','.mid':'audio/midi','.wav':'audio/wav',
   '.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.flac':'audio/flac','.ogg':'audio/ogg',
   '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
 const ext=name=>(String(name||'').match(/\.[^.]+$/)?.[0]||'').toLowerCase();
 const wait=(request)=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 function database(){
   if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
     const req=indexedDB.open(dbName,1);
     req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});};
     req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   return dbPromise;
 }
 function directory(){
   if(!dirPromise)dirPromise=navigator.storage.getDirectory().then(dir=>dir.getDirectoryHandle(rootName,{create:true}));
   return dirPromise;
 }
 function supported(){return Boolean(enabled&&root.isSecureContext&&root.indexedDB&&navigator.storage?.getDirectory&&root.crypto?.randomUUID);}
 async function item(id){const db=await database();return wait(db.transaction('projects').objectStore('projects').get(id));}
 async function put(value){const db=await database();return wait(db.transaction('projects','readwrite').objectStore('projects').put(value));}
 async function folder(id,create=false){
   if(!/^[\da-f-]{36}$/i.test(id))throw Error('잘못된 로컬 프로젝트 ID입니다.');
   return (await directory()).getDirectoryHandle(id,{create});
 }
 async function write(dir,name,file){const out=await dir.getFileHandle(name,{create:true});const writer=await out.createWritable();
   try{await file.stream().pipeTo(writer);}catch(error){try{await writer.abort();}catch(_e){}throw error;}
 }
 async function read(id,name){const dir=await folder(id);return (await dir.getFileHandle(name)).getFile();}
 function revoke(id,key){const token=`${id}/${key}`,url=urls.get(token);if(url){URL.revokeObjectURL(url);urls.delete(token);}}
 async function urlFor(id,key,name){
   const token=`${id}/${key}`;if(urls.has(token))return urls.get(token);
   const file=await read(id,name),url=URL.createObjectURL(file);urls.set(token,url);return url;
 }
 async function hydrate(record){
   if(!record)throw Error('저장된 로컬 프로젝트를 찾을 수 없습니다.');
   const meta=clone(record.meta);meta.local_project=true;
   if(record.assets.score)meta.local_score_url=await urlFor(meta.id,'score',record.assets.score);
   if(record.assets.audio)meta.local_audio_url=await urlFor(meta.id,'audio',record.assets.audio);
   if(record.assets.background)meta.local_background_url=await urlFor(meta.id,'background',record.assets.background);
   return meta;
 }
 async function audioDuration(file){
   const objectUrl=URL.createObjectURL(file);
   try{
     return await new Promise((resolve,reject)=>{
       const audio=document.createElement('audio');let done=false;
       const finish=(value,error)=>{if(done)return;done=true;audio.removeAttribute('src');audio.load();error?reject(error):resolve(value);};
       audio.preload='metadata';audio.onloadedmetadata=()=>finish(audio.duration);
       audio.onerror=()=>finish(null,Error('브라우저에서 오디오 형식을 열 수 없습니다. 다른 형식으로 변환해 주세요.'));
       audio.src=objectUrl;setTimeout(()=>finish(null,Error('음원 길이를 읽는 시간이 초과됐습니다.')),20000);
     });
   }finally{URL.revokeObjectURL(objectUrl);}
 }
 const allowedScore=['.musicxml','.xml','.mxl'],allowedMidi=['.mid','.midi'];
 const allowedAudio=['.wav','.mp3','.m4a','.aac','.flac','.ogg'];
 const imageExt=['.png','.jpg','.jpeg','.webp'];
 function checkFile(file,allowed,max,label){
   if(!file)return;
   if(!allowed.includes(ext(file.name)))throw Error(`${label}: 지원되지 않는 확장자입니다.`);
   if(!file.size||file.size>max)throw Error(`${label}: 파일 크기 제한을 초과했거나 비어 있습니다.`);
 }
 async function create({score,midi,audio}){
   if(!supported())throw Error('로컬 프로젝트는 HTTPS, IndexedDB, OPFS를 지원하는 브라우저에서만 사용할 수 있습니다.');
   if(!midi)throw Error('MIDI 파일은 필수입니다.');
   checkFile(midi,allowedMidi,20*1024*1024,'MIDI');checkFile(score,allowedScore,50*1024*1024,'MusicXML');
   checkFile(audio,allowedAudio,250*1024*1024,'음원');
   const timing=root.ScoreLocalMidi.parse(await midi.arrayBuffer());
   const prepared=score?await root.ScoreLocalMusicXML.prepare(score,timing):null;
   const duration=audio?await audioDuration(audio):root.ScoreBrowserSalamander.durationSeconds(timing);
   if(!Number.isFinite(duration)||duration<=0)throw Error('음원 길이를 읽지 못했습니다.');
   const id=crypto.randomUUID(),files={midi:'score.mid',score:prepared?'score.musicxml':null,
     audio:audio?`audio${ext(audio.name)}`:null,background:null};
   const meta={id,has_score:Boolean(score),generated_midi:false,generated_audio:!audio,
     audio_generation_mode:audio?'uploaded':'browser',
     score_name:score?.name||'',musicxml_title:prepared?.title||score?.name.replace(/\.(musicxml|xml|mxl)$/i,'')||midi.name.replace(/\.(mid|midi)$/i,''),
     midi_name:midi.name,audio_name:audio?.name||'Salamander Grand Piano',audio_filename:files.audio||'audio.wav',
     audio_duration_sec:duration,sync:null,background_filename:null,
     score_alignment:prepared?.alignment||null,staff_groups:prepared?.staff_groups||[],tie_continuations:prepared?.tie_continuations||[],
     repeat_info:prepared?.repeat_info||{mode:'none',warning:''},...timing};
   try{
     const dir=await folder(id,true);
     await write(dir,files.midi,midi);
     if(prepared)await write(dir,files.score,new Blob([prepared.score],{type:'application/xml'}));
     if(audio)await write(dir,files.audio,audio);
     await put({id,meta,assets:files,schema_version:1,updated_at:Date.now()});
   }catch(error){try{await (await directory()).removeEntry(id,{recursive:true});}catch(_e){}throw error;}
   return hydrate({id,meta,assets:files});
 }
 async function get(id){return hydrate(await item(id));}
 async function update(id,action){
   const record=await item(id);if(!record)throw Error('프로젝트를 찾을 수 없습니다.');
   const result=await action(record);record.updated_at=Date.now();await put(record);return result;
 }
 async function background(id,file){checkFile(file,imageExt,20*1024*1024,'배경 이미지');
   return update(id,async record=>{
     const next=`background${ext(file.name)}`;
     await write(await folder(id),next,file);
     if(record.assets.background&&record.assets.background!==next)try{await (await folder(id)).removeEntry(record.assets.background);}catch(_e){}
     revoke(id,'background');record.assets.background=next;
     record.meta.background_filename=next;record.meta.background_original_name=file.name;
     record.meta.background_version=String(Date.now());
     return {background_filename:next,background_original_name:file.name,background_version:record.meta.background_version};
   });
 }
 async function removeBackground(id){return update(id,async record=>{
   if(record.assets.background)try{await (await folder(id)).removeEntry(record.assets.background);}catch(_e){}
   revoke(id,'background');record.assets.background=null;record.meta.background_filename=null;
   record.meta.background_original_name=null;record.meta.background_version=null;
   return {background_filename:null};
 });}
 async function setStaffGroups(id,groups){
   if(!Array.isArray(groups)||groups.length>128)throw Error('악기 목록 형식이 올바르지 않습니다.');
   const clean=groups.map(g=>({id:String(g.id||''),name:String(g.name||''),part_index:Number(g.part_index),
     staves:Number(g.staves),transpositions:Array.isArray(g.transpositions)?g.transpositions:[]}));
   if(clean.some(g=>!g.id||!Number.isInteger(g.part_index)||g.staves<1||g.staves>32))throw Error('악기 목록에 잘못된 항목이 있습니다.');
   return update(id,record=>{record.meta.staff_groups=clone(clean);return clean;});
 }
 async function setEffects(id,settings){
   if(!settings||Object.keys(settings).length>100||JSON.stringify(settings).length>16000)throw Error('효과 설정의 크기가 잘못되었습니다.');
   return update(id,record=>{record.meta.effect_settings=clone(settings);return {saved:true};});
 }
 async function initialSync(id){
   const record=await item(id);if(!record)throw Error('프로젝트를 찾을 수 없습니다.');
   if(!record.assets.audio)throw Error('자동 생성된 음원은 MIDI와 이미 동기화되어 있습니다.');
   const file=await read(id,record.assets.audio),context=new AudioContext();
   try{
     const decoded=await context.decodeAudioData(await file.arrayBuffer());
     const sample=decoded.getChannelData(0),rate=decoded.sampleRate,step=Math.max(1,Math.round(rate*.01));
     let peak=0;for(let i=0;i<Math.min(sample.length,rate*30);i+=step){let sum=0;
       for(let j=i;j<Math.min(sample.length,i+step);j++)sum+=sample[j]*sample[j];peak=Math.max(peak,Math.sqrt(sum/step));}
     const threshold=Math.max(.006,peak*.09);let first=null;
     for(let i=0;i<Math.min(sample.length,rate*30);i+=step){let sum=0;
       for(let j=i;j<Math.min(sample.length,i+step);j++)sum+=sample[j]*sample[j];
       if(Math.sqrt(sum/step)>threshold){first=i/rate;break;}}
     if(first===null)throw Error('오디오 첫 타건을 찾지 못했습니다. 미세 조정을 사용해 주세요.');
     const midiStart=record.meta.note_events[0].second,delta=first-midiStart;
     if(Math.abs(delta)>30)throw Error('MIDI와 오디오 시작 지점이 30초 이상 차이납니다.');
     const anchors=[{midi:0,audio:delta},{midi:Math.max(1,record.meta.midi_duration_sec),audio:Math.max(1,record.meta.midi_duration_sec)+delta}];
     const data={anchors,offset_sec:delta,method:'first-onset-browser',confidence:'approximate'};
     await update(id,r=>{r.meta.sync=data;return data;});return data;
   }finally{await context.close();}
 }
 async function deleteSync(id){return update(id,r=>{r.meta.sync=null;return {cleared:true};});}
 async function diagnostics(id,report){return update(id,r=>{r.meta.render_diagnostics=clone(report);return {saved:true};});}
 function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});}
 async function request(url,options={}){
   if(!enabled)return fetch(url,options);
   const u=new URL(url,location.origin==='null'?'https://scoremotion.local':location.origin),path=u.pathname,method=String(options.method||'GET').toUpperCase();
   if(!path.startsWith('/api/'))throw Error('로컬 모드에서 API 요청 경로가 잘못되었습니다.');
   try{
     if(path==='/api/projects'&&method==='POST'){
       const form=options.body;return json(await create({score:form.get('score'),midi:form.get('midi'),audio:form.get('audio')}));
     }
     if(path==='/api/palette/themes'&&method==='GET')return json(root.ScoreLocalPalette.theme(u.searchParams.get('theme')||'space'));
     if(path==='/api/palette/extract'&&method==='POST')return json(await root.ScoreLocalPalette.extract(options.body.get('image')));
     const match=path.match(/^\/api\/projects\/([0-9a-f-]{36})(?:\/(.*))?$/i);
     if(!match)throw Error('공개용 버전에서는 이 서버 API를 제공하지 않습니다: '+path);
     const [,id,action='']=match,record=await item(id);
     if(!record)return json({detail:'로컬 프로젝트를 찾을 수 없습니다.'},404);
     if(!action&&method==='GET')return json(await hydrate(record));
     if(action==='effect-settings'&&method==='PUT')return json(await setEffects(id,JSON.parse(options.body)));
     if(action==='score'&&method==='GET')return new Response(await read(id,record.assets.score),{headers:{'content-type':'application/xml'}});
     if(action==='audio'&&method==='GET')return new Response(await read(id,record.assets.audio),{headers:{'content-type':mime[ext(record.assets.audio)]||'application/octet-stream'}});
     if(action==='audio/fallback')throw Error('공개용 버전에서는 서버 음원 합성을 제공하지 않습니다.');
     if(action==='background'&&method==='POST')return json(await background(id,options.body.get('background')));
     if(action==='background'&&method==='DELETE')return json(await removeBackground(id));
     if(action==='background'&&method==='GET')return new Response(await read(id,record.assets.background),{headers:{'content-type':mime[ext(record.assets.background)]||'image/png'}});
     if(action==='auto-sync'&&method==='POST')return json(await initialSync(id));
     if(action==='auto-sync'&&method==='DELETE')return json(await deleteSync(id));
     if(action==='render-diagnostics'&&method==='GET')return json(record.meta.render_diagnostics||{});
     if(action==='render-diagnostics'&&method==='POST')return json(await diagnostics(id,JSON.parse(options.body)));
     if(action==='status'&&method==='GET')return json({state:'idle',status:'idle',progress:0});
     throw Error('로컬 전용 모드에서 사용할 수 없는 기능입니다: '+action);
   }catch(error){return json({detail:String(error?.message||error)},400);}
 }
 root.ScoreLocalProjects={enabled,supported,create,get,request,urlFor,background,removeBackground,setStaffGroups,
   async delete(id){const db=await database();await wait(db.transaction('projects','readwrite').objectStore('projects').delete(id));
     try{await (await directory()).removeEntry(id,{recursive:true});}catch(_e){}
     for(const key of ['score','audio','background'])revoke(id,key);
   }};
})(typeof window!=='undefined'?window:globalThis);
