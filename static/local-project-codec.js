/* Browser-local MusicXML/MIDI analyser. No network upload or Python backend. */
(function(root){
'use strict';
const round=(n,d=6)=>Number(n.toFixed(d));
const child=(node,tag)=>node&&[...node.children].find(x=>x.localName===tag)||null;
const children=(node,tag)=>node?[...node.children].filter(x=>x.localName===tag):[];
const txt=(node,tag,def='')=>child(node,tag)?.textContent?.trim()||def;
function midiTiming(raw){
  const bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let pos=0;const fail=message=>{throw Error('MIDI: '+message);};
  const u8=()=>{if(pos>=bytes.length)fail('unexpected end');return bytes[pos++];};
  const u16=()=>u8()*256+u8();const u32=()=>u16()*65536+u16();
  const word=()=>String.fromCharCode(u8(),u8(),u8(),u8());
  const vlq=()=>{let v=0;for(let i=0;i<4;i++){const x=u8();v=(v<<7)|(x&127);if(!(x&128))return v;}fail('invalid VLQ');};
  if(word()!=='MThd')fail('missing MThd header');
  const headerSize=u32();if(headerSize<6||headerSize>4096)fail('invalid header');
  const kind=u16(),tracks=u16(),tpb=u16();pos+=headerSize-6;
  if(kind===2||kind>2)fail('type-2 independent tracks are not supported');
  if(!tpb||tpb&0x8000)fail('SMPTE time division is not supported');
  if(tracks<1||tracks>1024)fail('invalid track count');
  const events=[];let order=0;
  for(let tr=0;tr<tracks;tr++){
    if(word()!=='MTrk')fail('missing MTrk');const len=u32(),end=pos+len;
    if(end>bytes.length)fail('truncated track');
    let tick=0,running=0;
    while(pos<end){
      tick+=vlq();if(pos>=end)fail('truncated event');
      let status=bytes[pos];
      if(status&128){pos++;if(status<0xf0)running=status;else running=0;}
      else{if(!running)fail('running status without previous event');status=running;}
      if(status===0xff){const meta=u8(),size=vlq();if(pos+size>end)fail('truncated meta event');
        if(meta===0x51&&size===3){events.push({tick,order:order++,type:'tempo',us:(bytes[pos]<<16)|(bytes[pos+1]<<8)|bytes[pos+2]});}
        pos+=size;continue;
      }
      if(status===0xf0||status===0xf7){const size=vlq();pos+=size;if(pos>end)fail('truncated SysEx');continue;}
      if(status>=0xf0){const sizes={0xf1:1,0xf2:2,0xf3:1,0xf6:0,0xf8:0,0xfa:0,0xfb:0,0xfc:0,0xfe:0};
        if(!(status in sizes))fail('unsupported system event');pos+=sizes[status];continue;}
      const op=status>>4,ch=status&15,a=u8(),b=(op===0xc||op===0xd)?0:u8();
      if(op===0x9&&b>0)events.push({tick,order:order++,type:'on',channel:ch,pitch:a,velocity:b});
      else if(op===0x8||(op===0x9&&b===0))events.push({tick,order:order++,type:'off',channel:ch,pitch:a});
      else if(op===0xb&&a===64)events.push({tick,order:order++,type:'pedal',channel:ch,value:b});
    }
    if(pos!==end)fail('invalid track length');
  }
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
  let tick=0,tempo=500000,sec=0,firstTick=null,lastTick=0,noteCount=0;
  const tempo_map=[{beat:0,second:0,tempo_us:tempo}],note_events=[],pedal_events=[];
  const active=new Map(),sustained=new Map(),pedal=new Map();
  const key=e=>`${e.channel}:${e.pitch}`;
  for(const e of events){
    sec+=(e.tick-tick)/tpb*tempo/1e6;tick=e.tick;lastTick=tick;
    if(e.type==='tempo'){
      if(e.us<=0)continue;tempo=e.us;
      const point={beat:tick/tpb,second:round(sec,9),tempo_us:tempo};
      if(Math.abs(tempo_map.at(-1).beat-point.beat)<1e-10)tempo_map[tempo_map.length-1]=point;
      else tempo_map.push(point);
    }else if(e.type==='on'){
      noteCount++;firstTick??=tick;
      if(note_events.length>=100000)continue;
      const event={beat:round(tick/tpb),pitch:e.pitch,channel:e.channel,second:round(sec),velocity:e.velocity};
      note_events.push(event);const k=key(e),queue=active.get(k)||[];queue.push(event);active.set(k,queue);
    }else if(e.type==='off'){
      const k=key(e),queue=active.get(k);
      if(queue?.length){const n=queue.shift();n.end_second=round(sec);n.sustain_end_second=n.end_second;
        if(pedal.get(e.channel)){const held=sustained.get(e.channel)||[];held.push(n);sustained.set(e.channel,held);}}
    }else if(e.type==='pedal'){
      const down=e.value>=64,wasDown=!!pedal.get(e.channel);
      pedal_events.push({beat:round(tick/tpb),second:round(sec),channel:e.channel,value:e.value,down});
      if(wasDown&&!down){for(const n of sustained.get(e.channel)||[])n.sustain_end_second=round(sec);sustained.delete(e.channel);}
      pedal.set(e.channel,down);
    }
  }
  if(!noteCount)fail('no note-on events');
  for(const queue of active.values())for(const n of queue){n.end_second=round(sec);n.sustain_end_second=n.end_second;}
  for(const queue of sustained.values())for(const n of queue)n.sustain_end_second=round(sec);
  return {ticks_per_beat:tpb,tempo_map,note_count:noteCount,note_events,pedal_events,
    velocity_events_truncated:noteCount>note_events.length,first_note_beat:firstTick/tpb,midi_duration_sec:round(sec,3)};
}
function decodeScore(xmlText){
  const doc=new DOMParser().parseFromString(xmlText,'application/xml');
  const error=doc.querySelector('parsererror');if(error)throw Error('MusicXML XML 문법 오류: '+error.textContent.slice(0,180));
  const rootNode=doc.documentElement;if(!['score-partwise','score-timewise'].includes(rootNode?.localName))throw Error('MusicXML score-partwise 또는 score-timewise만 지원합니다.');
  const parts=[];
  if(rootNode.localName==='score-partwise')for(const part of children(rootNode,'part'))parts.push({id:part.getAttribute('id')||'',measures:children(part,'measure')});
  else{
    const map=new Map();for(const measure of children(rootNode,'measure'))for(const part of children(measure,'part')){
      const id=part.getAttribute('id')||'';if(!map.has(id))map.set(id,[]);
      const clone=doc.createElement('measure');clone.setAttribute('number',measure.getAttribute('number')||String(map.get(id).length+1));
      for(const node of [...part.children])clone.appendChild(node.cloneNode(true));map.get(id).push(clone);
    }
    for(const [id,measures] of map)parts.push({id,measures});
  }
  if(!parts.length)throw Error('MusicXML 파트를 찾을 수 없습니다.');
  const durations=[],perPart=[],ties=[];
  const steps={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  for(const part of parts){
    let divisions=1,chromatic=0,octaveChange=0,timeSig=4;
    const collected=[],rawTies=[];
    for(let mi=0;mi<part.measures.length;mi++){
      const measure=part.measures[mi];let cursor=0,lastStart=0,maxEnd=0;
      for(const el of [...measure.children]){
        const tag=el.localName;
        if(tag==='attributes'){
          divisions=Math.max(1,Number(txt(el,'divisions',divisions))||divisions);
          const tr=child(el,'transpose');if(tr){chromatic=Number(txt(tr,'chromatic','0'))||0;octaveChange=Number(txt(tr,'octave-change','0'))||0;}
          const tm=child(el,'time');if(tm)timeSig=4*Number(txt(tm,'beats','4'))/(Number(txt(tm,'beat-type','4'))||4);
        }else if(tag==='backup')cursor=Math.max(0,cursor-(Number(txt(el,'duration','0'))||0)/divisions);
        else if(tag==='forward'){cursor+=(Number(txt(el,'duration','0'))||0)/divisions;maxEnd=Math.max(maxEnd,cursor);}
        else if(tag==='note'){
          const chord=!!child(el,'chord'),grace=!!child(el,'grace');
          const start=chord?lastStart:cursor;if(!chord)lastStart=start;
          const duration=grace?0:Math.max(0,(Number(txt(el,'duration','0'))||0)/divisions);
          if(!chord)cursor+=duration;maxEnd=Math.max(maxEnd,start+duration,cursor);
          if(grace||child(el,'rest'))continue;
          const p=child(el,'pitch');if(!p)continue;
          const step=txt(p,'step').toUpperCase(),oct=Number(txt(p,'octave',''));
          if(!(step in steps)||!Number.isFinite(oct))continue;
          const pitch=12*(oct+1+octaveChange)+steps[step]+Math.round(Number(txt(p,'alter','0'))||0)+chromatic;
          if(pitch<0||pitch>127)continue;
          const types=new Set(children(el,'tie').map(t=>t.getAttribute('type')));
          for(const t of children(child(el,'notations'),'tied'))types.add(t.getAttribute('type'));
          const note={measure:mi,relative:round(start,8),pitch,voice:txt(el,'voice','1'),staff:txt(el,'staff','1'),types};
          rawTies.push(note);
          if(!types.has('stop'))collected.push(note);
        }
      }
      const span=maxEnd>0?maxEnd:timeSig;
      durations[mi]=Math.max(durations[mi]||0,span);
    }
    perPart.push(collected);ties.push({id:part.id,notes:rawTies});
  }
  const starts=[0];for(const d of durations)starts.push(starts.at(-1)+d);
  const groups=new Map();for(const notes of perPart)for(const n of notes){
    const beat=round(starts[n.measure]+n.relative),list=groups.get(beat)||[];list.push(n.pitch);groups.set(beat,list);
  }
  const tieContinuations=[];
  for(const part of ties){const opened=new Map();for(const n of part.notes){
    const beat=round(starts[n.measure]+n.relative),key=`${n.voice}:${n.staff}:${n.pitch}`;
    if(n.types.has('stop')&&opened.has(key))tieContinuations.push({beat,pitch:n.pitch,origin_beat:opened.get(key)});
    if(n.types.has('start')&&!opened.has(key))opened.set(key,beat);
    if(n.types.has('stop')&&!n.types.has('start'))opened.delete(key);
  }}
  const titleCandidates=[txt(rootNode,'movement-title'),txt(child(rootNode,'work'),'work-title')];
  for(const c of children(rootNode,'credit'))if((c.getAttribute('page')||'1')==='1'){
    const type=children(c,'credit-type').some(n=>n.textContent.trim()==='title');
    if(type)titleCandidates.push(txt(c,'credit-words'));
  }
  const title=titleCandidates.find(s=>s&&!['untitled','untitled score','title'].includes(s.toLowerCase()))||'';
  const hasRepeats=Array.from(rootNode.getElementsByTagName('*')).some(n=>['repeat','ending'].includes(n.localName)||n.localName==='sound'&&['dacapo','dalsegno','tocoda'].some(k=>n.hasAttribute(k)));
  return {title:title.slice(0,120),measureStarts:starts,groups:[...groups].sort((a,b)=>a[0]-b[0]).map(([beat,pitches])=>({beat,pitches:pitches.sort((a,b)=>a-b)})),tieContinuations,
    repeat_info:{mode:'original',warning:hasRepeats?'반복·도돌이표가 포함되어 있습니다. 브라우저 모드에서는 아직 연주 순서로 전개하지 않으므로 싱크를 확인하세요.':''}};
}
function alignScoreV1(score,midiTiming){
  const notes=score.groups,events=midiTiming.note_events;
  const groups=[];
  for(const e of [...events].sort((a,b)=>a.second-b.second||a.pitch-b.pitch)){
    const last=groups.at(-1),same=last?.events.some(x=>x.pitch===e.pitch&&e.second-x.second>.0015);
    if(!last||e.second-last.second>.05||same)groups.push({second:e.second,pitches:[],events:[]});
    groups.at(-1).pitches.push(e.pitch);groups.at(-1).events.push(e);
  }
  const pairs=[],used=new Set();let cursor=0;
  // Monotone local look-ahead, rather than expensive quadratic full-score DP.
  for(let i=0;i<notes.length;i++){
    const want=new Set(notes[i].pitches),start=cursor,end=Math.min(groups.length,cursor+48);
    let best=-1,bestCost=Infinity;
    for(let j=start;j<end;j++){
      if(used.has(j))continue;
      const found=new Set(groups[j].pitches),intersection=[...want].filter(p=>found.has(p)).length;
      const recall=intersection/Math.max(1,want.size);
      if(recall<.8)continue;
      const precision=intersection/Math.max(1,found.size);
      const cost=(1-recall)*2+(1-precision)*.1+(j-start)*.12;
      if(cost<bestCost){bestCost=cost;best=j;if(cost<.001)break;}
    }
    if(best>=0&&bestCost<1){pairs.push([i,best]);used.add(best);cursor=best+1;}
  }
  const anchors=pairs.map(([i,j])=>({beat:notes[i].beat,second:groups[j].second}));
  const clean=[];for(const a of anchors)if(!clean.length||a.beat>clean.at(-1).beat&&a.second>clean.at(-1).second)clean.push(a);
  const interpolate=beat=>{
    if(!clean.length){const t=midiTiming.tempo_map;let lo=0,hi=t.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(t[mid].beat<=beat)lo=mid;else hi=mid-1;}
      const p=t[lo];return p.second+(beat-p.beat)*p.tempo_us/1e6;}
    let lo=0,hi=clean.length;while(lo<hi){const mid=(lo+hi)>>>1;if(clean[mid].beat<beat)lo=mid+1;else hi=mid;}
    const a=clean[Math.max(0,lo-1)],b=clean[Math.min(clean.length-1,lo)];
    if(a===b)return a.second+(beat-a.beat)*.5;
    return a.second+(beat-a.beat)*(b.second-a.second)/(b.beat-a.beat);
  };
  const byPitch=new Map();for(const e of events){const a=byPitch.get(e.pitch)||[];a.push(e);byPitch.set(e.pitch,a);}
  const usedEvents=new Set(),note_matches=[];
  for(const s of notes){
    const center=interpolate(s.beat);
    for(const pitch of s.pitches){
      const list=byPitch.get(pitch)||[];
      let best=null,bestDistance=Infinity;
      // Restrict scan to short range around expected timestamp.
      let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>>1;if(list[mid].second<center-.12)lo=mid+1;else hi=mid;}
      for(let i=lo;i<list.length&&list[i].second<=center+.42;i++){
        const e=list[i],distance=Math.abs(e.second-center);
        if(!usedEvents.has(e)&&distance<bestDistance){bestDistance=distance;best=e;}
      }
      if(best){usedEvents.add(best);note_matches.push({beat:s.beat,pitch,second:best.second,end_second:best.end_second??best.second,velocity:best.velocity});}
    }
  }
  const total_notes=notes.reduce((n,g)=>n+g.pitches.length,0);
  const coverage=round(Math.min(clean.length/Math.max(1,notes.length),note_matches.length/Math.max(1,total_notes)),3);
  const status=coverage>=.9?'ok':'needs-review';
  return {method:'pitch-onset-anchors-v1',status,matched_groups:clean.length,total_groups:notes.length,
    matched_notes:note_matches.length,total_notes,coverage,anchors:clean,note_matches,
    message:status==='ok'?'음표·MIDI 타건 시점을 연결했습니다.':'MusicXML과 MIDI가 일부 불일치합니다. 반복·전조·아르페지오를 확인하세요.'};
}
function alignScore(score,timing,mode='auto'){
  return root.ScoreAlignmentV2?root.ScoreAlignmentV2.analyze(score,timing,mode,alignScoreV1):alignScoreV1(score,timing);
}
async function alignScoreAsync(score,timing,mode='auto'){
  if(mode==='v1'||typeof Worker!=='function')return alignScore(score,timing,mode);
  let worker;
  try{
    worker=new Worker('/static/score-alignment-worker.js?v=sync2');
    return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Score alignment worker timed out')),90000);
      const finish=(fn,value)=>{clearTimeout(timer);fn(value);};
      worker.onmessage=e=>e.data.error?finish(reject,Error(e.data.error)):finish(resolve,e.data.result);
      worker.onerror=e=>finish(reject,Error(e.message||'Score alignment worker failed'));
      worker.postMessage({score,timing:{note_events:timing.note_events,tempo_map:timing.tempo_map,note_count:timing.note_count,velocity_events_truncated:timing.velocity_events_truncated},mode});
    });
  }catch(error){
    // Fail explicitly rather than blocking the UI with a large main-thread DP.
    console.warn('Score alignment worker:',error);
    return {...alignScoreV1(score,timing),requested_mode:mode,status:'needs-review',limited:true,message:'Alignment worker unavailable; legacy alignment shown.'};
  }finally{worker?.terminate();}
}
async function unzipMxl(file){
  const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
  // ZIP central directory; compressed MusicXML uses deflate, usually with data descriptors.
  let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw Error('MXL ZIP 디렉터리를 읽을 수 없습니다.');
  let p=view.getUint32(eocd+16,true),rootName=null,entries=[];
  const decoder=new TextDecoder();
  for(let i=0,n=view.getUint16(eocd+10,true);i<n;i++){
    if(view.getUint32(p,true)!==0x02014b50)throw Error('손상된 MXL ZIP 엔트리');
    const flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),size=view.getUint32(p+20,true),rawSize=view.getUint32(p+24,true);
    const nameLen=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),offset=view.getUint32(p+42,true);
    const name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));
    if(name.toLowerCase().endsWith('.xml')||name.toLowerCase().endsWith('.musicxml'))entries.push({name,flags,method,size,rawSize,offset});
    p+=46+nameLen+extra+comment;
  }
  const entry=entries.find(e=>e.name==='META-INF/container.xml')||entries.find(e=>!e.name.startsWith('META-INF/'));
  if(!entry)throw Error('MXL 파일에 악보 XML이 없습니다.');
  async function unpack(e){
    if(e.rawSize>50*1024*1024||e.size>50*1024*1024)throw Error('압축 해제한 악보 크기가 50MB를 초과합니다.');
    if(view.getUint32(e.offset,true)!==0x04034b50)throw Error('MXL ZIP 로컬 엔트리 오류');
    const start=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true);
    if(start+e.size>bytes.length)throw Error('MXL ZIP 데이터가 손상되었습니다.');
    const source=bytes.subarray(start,start+e.size);
    if(e.method===0)return decoder.decode(source);
    if(e.method!==8)throw Error('지원하지 않는 MXL 압축 방식');
    let stream;try{stream=new Blob([source]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
    catch(_){throw Error('브라우저가 MXL 압축 해제를 지원하지 않습니다. .musicxml로 저장하여 사용하세요.');}
    const decoded=await new Response(stream).arrayBuffer();if(decoded.byteLength>50*1024*1024)throw Error('MusicXML 압축 해제 용량 초과');
    return decoder.decode(decoded);
  }
  if(entry.name==='META-INF/container.xml'){
    const meta=new DOMParser().parseFromString(await unpack(entry),'text/xml');const path=meta.getElementsByTagName('rootfile')[0]?.getAttribute('full-path')||meta.getElementsByTagNameNS('*','rootfile')[0]?.getAttribute('full-path');
    const main=entries.find(e=>e.name===path)||entries.find(e=>!e.name.startsWith('META-INF/'));if(!main)throw Error('MXL 악보 파일을 찾을 수 없습니다.');return unpack(main);
  }
  return unpack(entry);
}
// repeatClefRestore1: MusicXML attributes persist in written order. Repeats
// change that order, so recover the known source clef for each staff at jumps.
// Do not change pitches, divisions, transpose, timing, or existing clef changes.
function clefStaff(c){return c.getAttribute('number')||'1';}
function primaryClefs(a){return children(a,'clef').filter(c=>c.getAttribute('additional')!=='yes');}
function clefValue(c){return c?JSON.stringify(['sign','line','clef-octave-change'].map(k=>txt(c,k))):'';}
function updateClefs(m,state){
  for(const a of children(m,'attributes'))for(const c of primaryClefs(a))state.set(clefStaff(c),c);
}
function writtenClefHistory(measures){
  const state=new Map();return measures.map(m=>{const before=new Map(state);updateClefs(m,state);return before;});
}
function restoreJumpClefs(m,expected,actual){
  // Respect an explicit clef at the beginning of the target measure, but not
  // a later clef change after a note/forward/backup has advanced the cursor.
  const leading=[];
  for(const e of m.children){
    if(['note','forward','backup'].includes(e.localName))break;
    if(e.localName==='attributes')leading.push(e);
  }
  const explicit=new Set(leading.flatMap(primaryClefs).map(clefStaff));
  const needed=[...expected].filter(([staff,c])=>!explicit.has(staff)&&clefValue(c)!==clefValue(actual.get(staff)));
  if(!needed.length)return;
  let a=leading[0];
  if(!a){
    a=m.ownerDocument.createElementNS(m.namespaceURI,'attributes');
    const anchor=[...m.children].find(e=>e.localName!=='print'&&!(e.localName==='barline'&&e.getAttribute('location')==='left'));
    m.insertBefore(a,anchor||null);
  }
  // MusicXML attributes have an ordered content model. Clef follows part-symbol
  // and instruments, and precedes staff-details / transpose / measure-style.
  const after=new Set(['staff-details','transpose','for-part','directive','measure-style']);
  const anchor=[...a.children].find(e=>after.has(e.localName))||null;
  for(const [,c] of needed){const copy=c.cloneNode(true);copy.removeAttribute('id');a.insertBefore(copy,anchor);}
}
function unfoldScore(xmlText,restoreClefs=true){
  const doc=new DOMParser().parseFromString(xmlText,'application/xml'),root=doc.documentElement;
  if(root.localName!=='score-partwise')throw Error('score-timewise 반복 자동전개는 지원하지 않습니다.');
  const parts=children(root,'part'),measures=children(parts[0],'measure'),count=measures.length;
  if(!count||parts.some(p=>children(p,'measure').length!==count))throw Error('파트별 마디 수가 달라 반복 전개할 수 없습니다.');
  if([...root.getElementsByTagName('*')].some(e=>e.localName==='sound'&&['dacapo','dalsegno','tocoda','fine'].some(k=>e.hasAttribute(k))))
    throw Error('D.C./D.S./Coda 반복은 자동 전개할 수 없습니다.');
  const labels=[],spans=[],forward=[];let active=new Set(),carry=null,implicitEnd=-1;
  function numbers(s){const result=new Set();for(const part of (s||'').split(/[,\s]+/)){
    const m=part.match(/^(\d+)[-–](\d+)$/);if(m){for(let i=+m[1];i<=Math.min(8,+m[2]);i++)result.add(i);}
    else if(/^\d+$/.test(part)&&+part>0&&+part<=8)result.add(+part);
  }return result;}
  for(let i=0;i<count;i++){
    const m=measures[i];if(carry){active=carry;carry=null;}
    const left=[],right=[];
    for(const barline of children(m,'barline')){
      const here=barline.getAttribute('location')==='left'?left:right;
      for(const ending of children(barline,'ending'))here.push([ending.getAttribute('type'),numbers(ending.getAttribute('number'))]);
    }
    for(const [typ,nums] of left){if(typ==='start')active=nums;else if(typ==='stop'||typ==='discontinue')active=new Set();}
    labels[i]=new Set(active);
    for(const [typ,nums] of right){if(typ==='start')carry=nums;else if(typ==='stop'||typ==='discontinue')active=new Set();}
    for(const barline of children(m,'barline'))for(const rep of children(barline,'repeat')){
      if(rep.getAttribute('direction')==='forward')forward.push(i);
      if(rep.getAttribute('direction')==='backward'){
        const start=forward.length?forward.pop():implicitEnd+1,times=Math.max(2,Math.min(8,Number(rep.getAttribute('times'))||2));
        spans.push({start:Math.max(0,Math.min(i,start)),end:i,times});if(!forward.length)implicitEnd=i;
      }
    }
  }
  if(forward.length)throw Error('대응하는 종료 표시가 없는 되돌이표가 있습니다.');
  if(!spans.length)return null;
  for(const a of spans)for(const b of spans)if(a!==b&&a.start<b.start&&b.start<=a.end&&a.end<b.end)
    throw Error('겹쳐진 되돌이표는 지원하지 않습니다.');
  const byStart=new Map();for(const x of spans){if(byStart.has(x.start))throw Error('같은 마디에서 시작하는 여러 되돌이표를 지원하지 않습니다.');byStart.set(x.start,x);}
  const order=[];
  function expand(start,stop,iteration=null,opened=null){
    for(let i=start;i<=stop;i++){
      const inner=byStart.get(i);
      if(inner&&i!==opened&&inner.end<=stop){for(let turn=1;turn<=inner.times;turn++)expand(inner.start,inner.end,turn,inner.start);i=inner.end;continue;}
      if(!labels[i].size||iteration===null||labels[i].has(iteration))order.push(i);
      if(order.length>10000)throw Error('반복 전개가 10,000마디를 초과합니다.');
    }
  }
  expand(0,count-1);
  for(const part of parts){
    const originals=children(part,'measure'),history=writtenClefHistory(originals),actual=new Map();
    for(const n of originals)part.removeChild(n);
    for(let i=0;i<order.length;i++){
      const m=originals[order[i]].cloneNode(true);m.setAttribute('number',String(i+1));
      if(restoreClefs&&i>0&&order[i]!==order[i-1]+1)restoreJumpClefs(m,history[order[i]],actual);
      updateClefs(m,actual);
      for(const node of [m,...m.getElementsByTagName('*')]){
        if(node.hasAttribute('id'))node.setAttribute('id',`play${i+1}-`+node.getAttribute('id'));
        if(node.localName==='print'){node.removeAttribute('new-system');node.removeAttribute('new-page');}
      }
      for(const barline of children(m,'barline')){
        for(const c of [...barline.children])if(['repeat','ending'].includes(c.localName))barline.removeChild(c);
        if(!barline.children.length)m.removeChild(barline);
      }
      part.appendChild(m);
    }
  }
  return {xml:new XMLSerializer().serializeToString(doc),source_measures:count,playback_measures:order.length,spans};
}
// repeatClefRestore2: migrate old derived playback scores, never source assets.
// The complete legacy expansion must match, not just measure count or pitches.
function repeatClefRoot(xml){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.documentElement.localName!=='score-partwise'||doc.querySelector('parsererror'))return null;
  return new XMLSerializer().serializeToString(doc.documentElement);
}
function repairRepeatClefs(source,playback){
  if(typeof source!=='string'||typeof playback!=='string')return null;
  const fixed=unfoldScore(source);if(!fixed)return null;
  const current=repeatClefRoot(playback),target=repeatClefRoot(fixed.xml);
  if(!current||current===target)return null;
  const legacy=unfoldScore(source,false);
  if(!legacy||current!==repeatClefRoot(legacy.xml))return null;
  // Preserve whether the archived playback had a standard DTD header removed.
  const doc=new DOMParser().parseFromString(playback,'application/xml');
  const root=new DOMParser().parseFromString(fixed.xml,'application/xml').documentElement;
  doc.replaceChild(doc.importNode(root,true),doc.documentElement);
  return new XMLSerializer().serializeToString(doc);
}
function selectPerformance(xml,timing,mode='auto'){
  const parsed=decodeScore(xml),alignment=alignScore(parsed,timing,mode);
  if(!parsed.repeat_info.warning)return {xml,parsed,alignment,repeat_info:{mode:'written',warning:'',expanded:false}};
  let expanded;
  try{expanded=unfoldScore(xml);}catch(error){return {xml,parsed,alignment,repeat_info:{mode:'written',warning:'반복기호 자동 전개 제한: '+error.message,expanded:false}};}
  if(!expanded)return {xml,parsed,alignment,repeat_info:{mode:'written',warning:'반복기호는 있으나 자동 전개 가능한 도돌이표가 없습니다.',expanded:false}};
  const playback=decodeScore(expanded.xml),matched=alignScore(playback,timing,mode);
  const delta=matched.matched_notes-alignment.matched_notes;
  const added=Math.max(0,matched.total_notes-alignment.total_notes);
  const r1=alignment.matched_notes/Math.max(1,timing.note_count),r2=matched.matched_notes/Math.max(1,timing.note_count);
  const global=delta>=2&&matched.matched_notes>=alignment.matched_notes*1.12&&r2>=Math.max(.68,r1+.08)&&matched.coverage>=.68;
  const short=added>=2&&delta>=Math.max(2,Math.ceil(added*.7))&&r2>=.92&&matched.coverage>=.9&&r2>r1;
  const info={mode:global||short?'unfolded':'written',expanded:global||short,source_measures:expanded.source_measures,
    playback_measures:expanded.playback_measures,spans:expanded.spans,
    warning:global||short?'되돌이표를 MIDI 연주 순서로 전개했습니다.':'되돌이표가 있지만 MIDI의 반복 연주가 확인되지 않아 원본 악보를 사용합니다.'};
  return global||short?{xml:expanded.xml,parsed:playback,alignment:matched,repeat_info:info}:{xml,parsed,alignment,repeat_info:info};
}
async function selectPerformanceAsync(xml,timing,mode='auto'){
  const parsed=decodeScore(xml),alignment=await alignScoreAsync(parsed,timing,mode);
  if(!parsed.repeat_info.warning)return {xml,parsed,alignment,repeat_info:{mode:'written',warning:'',expanded:false}};
  let expanded;
  try{expanded=unfoldScore(xml);}catch(error){return {xml,parsed,alignment,repeat_info:{mode:'written',warning:'반복기호 자동 전개 제한: '+error.message,expanded:false}};}
  if(!expanded)return {xml,parsed,alignment,repeat_info:{mode:'written',warning:'반복기호는 있으나 자동 전개 가능한 도돌이표가 없습니다.',expanded:false}};
  const playback=decodeScore(expanded.xml),matched=await alignScoreAsync(playback,timing,mode);
  const delta=matched.matched_notes-alignment.matched_notes;
  const added=Math.max(0,matched.total_notes-alignment.total_notes);
  const r1=alignment.matched_notes/Math.max(1,timing.note_count),r2=matched.matched_notes/Math.max(1,timing.note_count);
  const global=delta>=2&&matched.matched_notes>=alignment.matched_notes*1.12&&r2>=Math.max(.68,r1+.08)&&matched.coverage>=.68;
  const short=added>=2&&delta>=Math.max(2,Math.ceil(added*.7))&&r2>=.92&&matched.coverage>=.9&&r2>r1;
  const info={mode:global||short?'unfolded':'written',expanded:global||short,source_measures:expanded.source_measures,
    playback_measures:expanded.playback_measures,spans:expanded.spans,
    warning:global||short?'되돌이표를 MIDI 연주 순서로 전개했습니다.':'되돌이표가 있지만 MIDI의 반복 연주가 확인되지 않아 원본 악보를 사용합니다.'};
  return global||short?{xml:expanded.xml,parsed:playback,alignment:matched,repeat_info:info}:{xml,parsed,alignment,repeat_info:info};
}
root.ScoreLocalCodec={repairRepeatClefs,midiTiming,decodeScore,alignScore,alignScoreV1,alignScoreAsync,selectPerformance,selectPerformanceAsync,async readScore(file){return file.name.toLowerCase().endsWith('.mxl')?unzipMxl(file):file.text();}};
})(typeof window!=='undefined'?window:self);
