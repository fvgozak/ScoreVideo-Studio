/* Schema v1 bridge between ScoreMotion's browser IndexedDB record and a
 * portable .scoremotion archive. No server, network or user-account state. */
(function(root){
'use strict';
const ZIP=root.ScoreProjectArchive;
if(!ZIP)throw Error('ScoreProjectArchive must be loaded before ScoreProjectIO.');
const MIME={score:'application/vnd.recordare.musicxml+xml',midi:'audio/midi',audio:'application/octet-stream',background:'image/png',palette_source:'image/png'};
const EXT={score:'.musicxml',midi:'.mid',audio:'.wav',background:'.png',palette_source:'.png'};
const ROLES=['score','midi','audio','background','palette_source'];
const folder={score:'score',midi:'midi',audio:'audio',background:'images',palette_source:'images'};
const asBlob=(value,mime='application/octet-stream')=>value instanceof Blob?value:typeof value==='string'?new Blob([value],{type:mime}):null;
function nameFor(value,fallback){return typeof value?.name==='string'&&value.name?value.name:fallback;}
function safeExtension(name,fallback){const match=/\.(musicxml|xml|mxl|midi|mid|wav|mp3|m4a|aac|flac|ogg|png|jpe?g|webp)$/i.exec(name||'');return match?'.'+match[1].toLowerCase():fallback;}
function assetFromRecord(record,role){
  if(role==='score')return record.scoreOriginal||record.score&&new File([record.score],record.meta.score_name?.replace(/\.mxl$/i,'.musicxml')||'legacy-score.musicxml',{type:MIME.score});
  if(role==='midi')return record.midi;
  // Synthesized Salamander audio is a local playback cache, not a user asset.
  if(role==='audio')return record.meta?.generated_audio?null:record.audio;
  if(role==='background')return record.background;
  if(role==='palette_source')return record.paletteSource;
  return null;
}
async function exportProject(record,projectState,options={}){
  if(!record?.meta?.id||!record.midi)throw Error('내보낼 로컬 프로젝트가 없습니다.');
  const now=new Date().toISOString(),assets={entries:{},bindings:{}},entries=[],warnings=[];
  for(const role of ROLES){
    const original=assetFromRecord(record,role),blob=asBlob(original,role==='score'?MIME.score:undefined);
    if(!blob){assets.bindings[role]=null;continue;}
    const fallback=`${role}${EXT[role]}`,originalName=nameFor(original,role==='score'&&record.meta.score_name||record.meta[role+'_name']||fallback);
    const path=`assets/${folder[role]}/${role}-source${safeExtension(originalName,EXT[role])}`;
    const sum=await ZIP.checksums(blob),id=`${role}-main`;
    const legacy=role==='score'&&!record.scoreOriginal;
    if(legacy)warnings.push('score_original_missing_legacy');
    assets.entries[id]={role,path,original_name:originalName,mime_type:blob.type||MIME[role],byte_size:blob.size,sha256:sum.sha256,
      origin:legacy?'imported':role==='audio'&&record.meta.generated_audio?'generated':'uploaded',
      ...(role==='score'?{source_format:legacy?'musicxml':safeExtension(originalName,'.musicxml').slice(1)}:{})};
    assets.bindings[role]=id;entries.push({path,blob});
  }
  if(!assets.bindings.midi)throw Error('MIDI 파일이 누락되어 프로젝트를 저장할 수 없습니다.');
  if(!assets.bindings.audio&&!record.meta.generated_audio)throw Error('업로드 음원이 누락됐습니다. 원본 파일을 다시 확인해 주세요.');
  const camera=projectState?.timeline?.camera||{schema_version:1,camera_points:[]};
  const sync=projectState?.timeline?.synchronization||{schema_version:1,midi_to_audio:record.meta.sync||null,manual_offsets:{score_offset_sec:0,piano_offset_sec:0},user_locks:[],review_state:'valid'};
  const analysis={schema_version:1,meta:record.meta,diagnostics:record.diagnostics||null};
  const manifest={format:'scoremotion-project',schema_version:1,project_id:options.forkId||record.meta.id,
    project_name:String(projectState?.project_name||record.meta.musicxml_title||record.meta.score_name||record.meta.midi_name||'ScoreMotion'),
    created_at:record.createdAt||now,updated_at:now,producer:{app:'ScoreMotion',version:'browser-local',exported_at:now},
    assets,settings:projectState?.settings||{controls:{},staff_colors:{enabled:false,keyboard:false,colors:{}},export:{download_name:''}},
    timeline:{synchronization:'timeline/synchronization.json',camera:'timeline/camera.json',scene_overlays:null},
    analysis:{data_file:'derived/analysis.json',generator_version:'scoremotion-analysis-v1'},
    preview:{playhead_sec:Number(projectState?.preview?.playhead_sec)||0,thumbnail:null},
    extensions:{...(projectState?.extensions||{}),...(options.forkFrom?{forked_from_project_id:options.forkFrom}:{}),...(warnings.length?{legacy_source_warnings:warnings}:{}),
      ...(record.meta.generated_audio?{audio_mode:'generate-from-midi',audio_generator:'salamander-v1'}:{})}};
  ZIP.validateManifest(manifest);
  entries.push({path:'timeline/synchronization.json',json:sync},{path:'timeline/camera.json',json:camera},{path:'derived/analysis.json',json:analysis});
  if(record.score!=null&&record.meta.has_score!==false)entries.push({path:'derived/score-playback.musicxml',blob:asBlob(record.score,'application/xml')});
  if(record.score!=null&&record.meta.has_score!==false)manifest.analysis.score_playback='derived/score-playback.musicxml';
  entries.unshift({path:'project.json',json:manifest});
  return {blob:await ZIP.build(entries),manifest,warnings};
}
/** A MusicXML DTD is a historical public identifier, not permission to load it.
 * Strictly allow official Recordare/MakeMusic declarations; strip before parse.
 * Internal subsets, arbitrary system URLs and all ENTITY declarations are unsafe.
 */
function normalizeMusicXML(xml){
  if(typeof xml!=='string')throw Error('MusicXML 데이터가 유효하지 않습니다.');
  if(/<!\s*ENTITY\b/i.test(xml))throw Error('MusicXML 내부 엔티티 선언은 허용되지 않습니다.');
  const declaration=/<!DOCTYPE\b[\s\S]*?>/gi;
  const matches=[...xml.matchAll(declaration)];
  if(matches.length>1||(/<!DOCTYPE\b/i.test(xml)&&!matches.length))
    throw Error('MusicXML DOCTYPE 선언이 잘못되었습니다.');
  if(!matches.length)return xml;
  const raw=matches[0][0];
  // XML may contain one standard MusicXML DTD header without an internal subset.
  const publicMatch=/^<!DOCTYPE\s+score-(partwise|timewise)\s+PUBLIC\s+(["'])-\/\/Recordare\/\/DTD MusicXML\s+\d+(?:\.\d+)?\s+(Partwise|Timewise)\/\/EN\2\s+(["'])https?:\/\/(?:www\.)?musicxml\.org\/dtds\/(partwise|timewise)\.dtd\4\s*>$/i.exec(raw);
  const systemMatch=/^<!DOCTYPE\s+score-(partwise|timewise)\s+SYSTEM\s+(["'])https?:\/\/(?:www\.)?musicxml\.org\/dtds\/(partwise|timewise)\.dtd\2\s*>$/i.exec(raw);
  const simpleMatch=/^<!DOCTYPE\s+score-(partwise|timewise)\s*>$/i.exec(raw);
  const valid=publicMatch&&publicMatch[1].toLowerCase()===publicMatch[3].toLowerCase()&&publicMatch[1].toLowerCase()===publicMatch[5].toLowerCase()
    ||systemMatch&&systemMatch[1].toLowerCase()===systemMatch[3].toLowerCase()||simpleMatch;
  if(!valid||/[\[\]]/.test(raw))throw Error('허용되지 않는 MusicXML 외부 DTD 선언입니다.');
  return xml.slice(0,matches[0].index)+xml.slice(matches[0].index+raw.length);
}

// SCORE_EDITOR_ARCHIVE_V121: same legacy UTF-16 fingerprint as Score Editor V1/V1.2.
// Only migrate a fingerprint proven to identify the exact validated playback XML,
// before its allowed DOCTYPE is removed. Never attach edits to a different score.
function scoreEditorFingerprint(xml){
  let a=2166136261,b=0x9e3779b9;
  for(let i=0;i<xml.length;i++){const c=xml.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);}
  return `${xml.length}:${(a>>>0).toString(16).padStart(8,'0')}:${(b>>>0).toString(16).padStart(8,'0')}`;
}
function restoreScoreEditorIdentity(extensions,rawPlayback,playback,rawSource,source){
  const editor=extensions?.score_editor;
  if(editor?.version!==1||typeof editor.source!=='string'||typeof playback!=='string')return extensions;
  const current=scoreEditorFingerprint(playback);
  if(editor.source===current)return extensions;
  // The second condition also recovers older archives re-saved after stripping
  // the header, if the uploaded original is identical after normalization.
  const samePlayback=typeof rawPlayback==='string'&&editor.source===scoreEditorFingerprint(rawPlayback);
  const sameOriginal=typeof rawSource==='string'&&source===playback&&editor.source===scoreEditorFingerprint(rawSource);
  if(!samePlayback&&!sameOriginal)return extensions;
  return {...extensions,score_editor:{...editor,source:current}};
}

async function readArchive(file){
  const zip=await ZIP.inspect(file);
  const manifest=ZIP.validateManifest(await zip.json('project.json'));
  const needed=new Set(['project.json']);
  for(const e of Object.values(manifest.assets.entries))needed.add(e.path);
  for(const name of Object.values(manifest.timeline))if(name)needed.add(name);
  if(manifest.analysis?.data_file)needed.add(manifest.analysis.data_file);
  if(manifest.analysis?.score_playback)needed.add(manifest.analysis.score_playback);
  for(const path of needed)if(!zip.entries.has(path))throw Error('프로젝트 파일이 누락됐습니다: '+path);
  const files={};
  for(const [role,id] of Object.entries(manifest.assets.bindings)){
    if(!id)continue;
    const item=manifest.assets.entries[id];
    const limits={score:50,midi:20,audio:250,background:20,palette_source:20};
    if(limits[role]&&item.byte_size>limits[role]*1024*1024)throw Error('브라우저 파일 크기 제한을 초과했습니다: '+role);
    const blob=await zip.extract(item.path),sum=await ZIP.checksums(blob);
    if(blob.size!==item.byte_size||sum.sha256!==item.sha256)throw Error('파일 SHA-256 검증 실패: '+item.original_name);
    if(ROLES.includes(role))files[role]=new File([blob],item.original_name,{type:item.mime_type||MIME[role]||'application/octet-stream'});
  }
  if(!files.midi)throw Error('프로젝트에 MIDI가 없습니다.');
  const midiHead=new Uint8Array(await files.midi.slice(0,4).arrayBuffer());
  if(String.fromCharCode(...midiHead)!=='MThd')throw Error('유효하지 않은 MIDI 원본입니다.');
  if(files.score){
    const name=files.score.name.toLowerCase();if(/\.mxl$/.test(name)){
      const head=new Uint8Array(await files.score.slice(0,2).arrayBuffer());if(head[0]!==80||head[1]!==75)throw Error('원본 MXL이 ZIP 형식이 아닙니다.');
    }else if(!/\.xml$|\.musicxml$/.test(name))throw Error('악보 확장자가 유효하지 않습니다.');
  }
  const sync=await zip.json(manifest.timeline.synchronization),camera=await zip.json(manifest.timeline.camera);
  if(!Array.isArray(camera?.camera_points)||camera.camera_points.length>500)throw Error('카메라 포인트 정보가 손상됐습니다.');
  const analysis=manifest.analysis?.data_file?await zip.json(manifest.analysis.data_file):{};
  const meta=analysis?.meta;
  if(!meta||!Array.isArray(meta.tempo_map)||!Array.isArray(meta.note_events)||meta.note_events.length>100000||!Number.isFinite(Number(meta.audio_duration_sec)))throw Error('프로젝트 MIDI 분석 정보가 손상됐습니다.');
  if(meta.has_score!==Boolean(files.score))throw Error('프로젝트 원본 악보 정보가 불일치합니다.');
  // Standard MusicXML PUBLIC/SYSTEM DTD headers are not entity definitions.
  // Never resolve the remote DTD: accept only the official declaration, then
  // remove it before handing the document to DOMParser/OSMD. Keep source bytes.
  let score=null,rawSource=null,source=null,rawPlayback=null;
  if(files.score){
    rawSource=await root.ScoreLocalProjects.codec.readScore(files.score);
    source=normalizeMusicXML(rawSource);
    root.ScoreLocalProjects.codec.decodeScore(source);
    rawPlayback=manifest.analysis?.score_playback
      ?await (await zip.extract(manifest.analysis.score_playback)).text()
      :rawSource;
    score=normalizeMusicXML(rawPlayback);
    root.ScoreLocalProjects.codec.decodeScore(score);
  }
  // Reject malformed MIDI before using it as the source for new playback audio.
  const midiTiming=root.ScoreLocalProjects.codec.midiTiming(await files.midi.arrayBuffer());
  const needsGeneration=!files.audio;
  if(needsGeneration){
    if(meta.generated_audio!==true||manifest.extensions?.audio_mode!=='generate-from-midi')
      throw Error('업로드 음원이 프로젝트에 포함되지 않았습니다.');
    if(typeof root.ScoreLocalProjects.generateAudio!=='function')
      throw Error('이 버전의 ScoreMotion은 MIDI 음원 재생성을 지원하지 않습니다.');
    // Generate only after every imported asset and score was validated.
    files.audio=await root.ScoreLocalProjects.generateAudio(midiTiming);
    meta.audio_name='Salamander Grand Piano';meta.audio_filename='audio.wav';
  }
  if(typeof root.ScoreLocalProjects.validateAudio==='function'){
    const seconds=await root.ScoreLocalProjects.validateAudio(files.audio);
    if(!Number.isFinite(seconds)||seconds<=0||(!needsGeneration&&Math.abs(seconds-Number(meta.audio_duration_sec))>2))
      throw Error('오디오 길이와 저장된 프로젝트 정보가 일치하지 않습니다.');
    if(needsGeneration)meta.audio_duration_sec=seconds;
  }
  const state={schema_version:1,project_name:manifest.project_name,settings:manifest.settings,timeline:{synchronization:sync,camera},
    preview:manifest.preview||{},extensions:restoreScoreEditorIdentity(manifest.extensions||{},rawPlayback,score,rawSource,source)};
  const id=manifest.project_id;
  const record={id,meta:{...meta,id,sync:sync.midi_to_audio??meta.sync??null},score,scoreOriginal:files.score||null,
    midi:files.midi,audio:files.audio,background:files.background||null,paletteSource:files.palette_source||null,
    diagnostics:analysis.diagnostics||null,state,createdAt:manifest.created_at};
  return {manifest,record};
}
root.ScoreProjectIO={exportProject,readArchive,assetFromRecord,normalizeMusicXML};
})(typeof window!=='undefined'?window:globalThis);
