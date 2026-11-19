/* Client-side MusicXML parsing and cautious score↔MIDI alignment.
   Unsupported repeat structures are reported instead of pretending they align. */
(function(root){
 'use strict';
 const STEP={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
 const direct=(e,name)=>e?Array.from(e.children).find(c=>c.localName===name)||null:null;
 const children=(e,name)=>e?Array.from(e.children).filter(c=>c.localName===name):[];
 const value=(e,name,fallback='')=>direct(e,name)?.textContent?.trim()||fallback;
 const num=(e,name,def=0)=>Number(value(e,name,String(def)))||0;
 const parse=text=>{
   const xml=new DOMParser().parseFromString(text,'application/xml');
   if(xml.querySelector('parsererror'))throw Error('MusicXML XML 구문이 올바르지 않습니다.');
   if(xml.documentElement.localName!=='score-partwise')throw Error('현재 브라우저 분석은 score-partwise MusicXML만 지원합니다.');
   if(!children(xml.documentElement,'part').length)throw Error('MusicXML에 악기 파트가 없습니다.');
   return xml;
 };
 const title=xml=>value(xml.documentElement,'movement-title')||value(direct(xml.documentElement,'work'),'work-title')||'';
 // MusicXML <transpose> specifies semitones FROM written TO sounding pitch.
 // A B-flat clarinet therefore uses -2 (written C -> sounding B-flat).
 function partCatalog(xml){
   const scores=children(xml.documentElement,'part');
   const known=children(direct(xml.documentElement,'part-list'),'score-part');
   return scores.map((part,pi)=>{
     const id=part.getAttribute('id')||`P${pi+1}`;
     const named=known.find(entry=>entry.getAttribute('id')===id);
     const scoreInstrument=children(named,'score-instrument')[0];
     const name=value(named,'part-name')||value(scoreInstrument,'instrument-name')||value(named,'part-abbreviation')||`Part ${pi+1}`;
     let count=1;const history=[];
     for(const [mi,measure] of children(part,'measure').entries()){
       for(const child of measure.children){
         if(child.localName==='attributes'){
           count=Math.max(count,num(child,'staves',count));
           for(const tr of children(child,'transpose')){
             const staff=tr.hasAttribute('number')?(Number(tr.getAttribute('number'))||1):0;
             const semitones=num(tr,'chromatic',0)+12*num(tr,'octave-change',0);
             history.push({measure:mi,staff,semitones});
           }
         }else if(child.localName==='note'){
           count=Math.max(count,Number(value(child,'staff','1'))||1);
         }
       }
     }
     return {id,name,part_index:pi,staves:Math.min(32,count),transpositions:history};
   });
 }
 function transpositionAt(part,measure,staff){
   let globalShift=0,localShift=null;
   for(const entry of part?.transpositions||[]){
     if(entry.measure>measure)break;
     if(entry.staff===0)globalShift=entry.semitones;
     else if(entry.staff===staff)localShift=entry.semitones;
   }
   return localShift===null?globalShift:localShift;
 }
 function scoreNotes(xml,{pitchMode='concert'}={}){
   const catalog=partCatalog(xml);

   const parts=children(xml.documentElement,'part');
   const measures=parts.map(p=>children(p,'measure'));
   const spans=[];
   const collected=[],tieRaw=[];
   parts.forEach((part,pi)=>{
     let div=1,timeSig=4;
     measures[pi].forEach((measure,mi)=>{
       let cursor=0,previous=0,maxEnd=0;
       for(const e of measure.children){
         const tag=e.localName;
         if(tag==='attributes'){
           div=Math.max(1,num(e,'divisions',div));
           const t=direct(e,'time');if(t){const beats=num(t,'beats',4),beatType=num(t,'beat-type',4);if(beatType)timeSig=4*beats/beatType;}
         }else if(tag==='backup'){cursor=Math.max(0,cursor-num(e,'duration')/div);}
         else if(tag==='forward'){cursor+=num(e,'duration')/div;maxEnd=Math.max(maxEnd,cursor);}
         else if(tag==='note'){
           const chord=!!direct(e,'chord'),grace=!!direct(e,'grace');
           const beat=chord?previous:cursor,span=grace?0:num(e,'duration')/div;
           if(!chord){previous=cursor;cursor+=span;}maxEnd=Math.max(maxEnd,cursor,beat+span);
           const pitchEl=direct(e,'pitch');if(!pitchEl||grace||direct(e,'rest'))continue;
           const step=value(pitchEl,'step').toUpperCase();if(!(step in STEP))continue;
           const staff=Number(value(e,'staff','1'))||1;
           const written=12*(num(pitchEl,'octave',4)+1)+STEP[step]+num(pitchEl,'alter');
           const pitch=written+(pitchMode==='concert'?transpositionAt(catalog[pi],mi,staff):0);
           if(pitch<0||pitch>127)continue;
           const types=children(e,'tie').map(t=>t.getAttribute('type'));
           for(const tied of children(direct(e,'notations'),'tied'))types.push(tied.getAttribute('type'));
           const note={pi,mi,beat,pitch,types,voice:value(e,'voice','1'),staff:value(e,'staff','1')};if(types.includes('stop'))tieRaw.push(note);
           else collected.push(note);
         }
       }
       const span=maxEnd>0?maxEnd:timeSig;spans[mi]=Math.max(spans[mi]||0,span);
     });
   });
   const starts=[0];spans.forEach(span=>starts.push(starts.at(-1)+span));
   const attacks=collected.map(n=>({...n,beat:+(starts[n.mi]+n.beat).toFixed(8)}))
     .sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch);
   const ties=tieRaw.map(n=>({...n,beat:+(starts[n.mi]+n.beat).toFixed(8)}));
   return {attacks,ties};
 }
 function inspectRepeat(xml){
   const parts=children(xml.documentElement,'part'),bars=children(parts[0],'measure');
   let has=false;
   for(const part of parts){
     for(const e of part.getElementsByTagName('*')){
       if(e.localName==='sound'&&['dacapo','dalsegno','tocoda','fine'].some(a=>e.hasAttribute(a)))
         throw Error('D.C.·D.S.·Coda·Fine 악보는 브라우저 반복 전개에서 아직 지원하지 않습니다.');
     }
   }
   if(parts.some(p=>children(p,'measure').length!==bars.length))throw Error('MusicXML 파트별 마디 수가 다릅니다.');
   const marks=bars.map(m=>{
     const reps=children(m,'barline').flatMap(b=>children(b,'repeat'));
     const endings=children(m,'barline').flatMap(b=>children(b,'ending'));
     if(endings.length)has=true;
     return {forward:reps.some(r=>r.getAttribute('direction')==='forward'),
       backward:reps.some(r=>r.getAttribute('direction')==='backward'),
       times:Math.max(2,Math.min(8,Number(reps.find(r=>r.getAttribute('direction')==='backward')?.getAttribute('times')||2))),
       endings:endings.length};
   });
   if(marks.some(m=>m.forward||m.backward))has=true;
   return {has,marks,bars};
 }
 function unfoldRepeats(xml){
   const info=inspectRepeat(xml);const len=info.bars.length,plain=Array.from({length:len},(_,i)=>i);
   if(!info.has)return {xml,order:plain,changed:false,warning:''};
   if(info.marks.some(m=>m.endings))throw Error('1·2번 괄호를 포함한 되돌이표는 아직 브라우저에서 지원하지 않습니다.');
   const opens=[],spans=[];let lastImplicit=-1;
   info.marks.forEach((m,i)=>{
     if(m.forward)opens.push(i);
     if(m.backward){const start=opens.length?opens.pop():lastImplicit+1;spans.push({start,end:i,times:m.times});
       if(!opens.length)lastImplicit=i;}
   });
   if(opens.length)throw Error('시작 되돌이표에 대응하는 끝 되돌이표가 없습니다.');
   if(spans.some(a=>spans.some(b=>a!==b&&a.start<b.start&&b.start<=a.end&&a.end<b.end)))
     throw Error('겹쳐진 되돌이표를 해석할 수 없습니다.');
   const byStart=new Map();for(const s of spans){if(byStart.has(s.start))throw Error('복수의 중첩 반복을 지원하지 않습니다.');byStart.set(s.start,s);}
   const order=[];
   const expand=(start,stop,opened=-1)=>{for(let i=start;i<=stop;){
     const span=byStart.get(i);
     if(span&&i!==opened&&span.end<=stop){for(let n=0;n<span.times;n++)expand(i,span.end,i);i=span.end+1;}
     else{order.push(i++);if(order.length>10000)throw Error('반복 전개가 10,000마디를 초과합니다.');}
   }};
   expand(0,len-1);
   if(order.length===len)return {xml,order,changed:false,warning:''};
   const expanded=xml.cloneNode(true);
   for(const part of children(expanded.documentElement,'part')){
     const originals=children(part,'measure');originals.forEach(el=>part.removeChild(el));
     order.forEach((index,i)=>{
       const clone=originals[index].cloneNode(true);clone.setAttribute('number',String(i+1));
       for(const el of clone.getElementsByTagName('*')){
         if(el.hasAttribute('id'))el.setAttribute('id',`play${i+1}-${el.getAttribute('id')}`);
         if(el.localName==='print'){el.removeAttribute('new-system');el.removeAttribute('new-page');}
       }
       for(const bar of children(clone,'barline')){
         for(const mark of Array.from(bar.children))if(['repeat','ending'].includes(mark.localName))bar.removeChild(mark);
         if(!bar.children.length)clone.removeChild(bar);
       }
       part.appendChild(clone);
     });
   }
   return {xml:expanded,order,changed:true,warning:''};
 }
 // Python score_alignment.py's pitch-sequence method ported to the browser.
 // Longest contiguous pitch-token matches establish reliable anchor blocks,
 // then nearby rolled/incomplete chords are recovered without crossing them.
 function longestBlocks(a,b){
   const lookup=new Map();b.forEach((token,i)=>{let list=lookup.get(token);if(!list){list=[];lookup.set(token,list);}list.push(i);});
   const result=[],stack=[[0,a.length,0,b.length]];
   while(stack.length){
     const [alo,ahi,blo,bhi]=stack.pop();let bestI=alo,bestJ=blo,bestN=0,previous=new Map();
     for(let i=alo;i<ahi;i++){
       const next=new Map();
       for(const j of lookup.get(a[i])||[]){
         if(j<blo||j>=bhi)continue;
         const k=(previous.get(j-1)||0)+1;next.set(j,k);
         if(k>bestN){bestI=i-k+1;bestJ=j-k+1;bestN=k;}
       }
       previous=next;
     }
     if(bestN){
       result.push([bestI,bestJ,bestN]);
       if(alo<bestI&&blo<bestJ)stack.push([alo,bestI,blo,bestJ]);
       if(bestI+bestN<ahi&&bestJ+bestN<bhi)stack.push([bestI+bestN,ahi,bestJ+bestN,bhi]);
     }
   }
   return result.sort((x,y)=>x[0]-y[0]);
 }
 function align(xml,timing,{pitchMode='concert'}={}){
   const {attacks,ties}=scoreNotes(xml,{pitchMode}),events=timing.note_events;
   const byBeat=new Map();for(const n of attacks){const list=byBeat.get(n.beat)||[];list.push(n.pitch);byBeat.set(n.beat,list);}
   const score=[...byBeat].sort((a,b)=>a[0]-b[0]).map(([beat,pitches])=>({beat,pitches:pitches.sort((a,b)=>a-b)}));
   const midi=[];
   for(const event of [...events].sort((a,b)=>a.second-b.second||a.pitch-b.pitch)){
     let group=midi.at(-1);
     const retrigger=group?.events.some(old=>old.pitch===event.pitch&&event.second-old.second>.0015);
     if(!group||event.second-group.second>.05||retrigger){group={second:event.second,pitches:[],events:[]};midi.push(group);}
     group.pitches.push(event.pitch);group.events.push(event);
   }
   const pairs=new Map(),usedMidi=new Set();
   if(score.length&&midi.length){
     const token=s=>[...new Set(s.pitches)].sort((a,b)=>a-b).join(',');
     const blocks=longestBlocks(score.map(token),midi.map(token));
     for(const [i,j,size] of blocks)for(let n=0;n<size;n++){pairs.set(i+n,j+n);usedMidi.add(j+n);}
     const exact=[...pairs].sort((a,b)=>a[0]-b[0]);
     for(let si=0;si<score.length;si++){
       if(pairs.has(si))continue;
       let left=null,right=null;
       for(const p of exact){if(p[0]<si)left=p;else{right=p;break;}}
       let start=left?left[1]+1:0,end=right?right[1]:midi.length;
       if(start>=end)continue;
       let expected=si/Math.max(1,score.length-1)*Math.max(1,midi.length-1);
       if(left&&right){const ratio=(score[si].beat-score[left[0]].beat)/Math.max(.000001,score[right[0]].beat-score[left[0]].beat);
         expected=left[1]+ratio*(right[1]-left[1]);}
       else if(left)expected=left[1]+si-left[0];
       else if(right)expected=right[1]-(right[0]-si);
       if(end-start>250){start=Math.max(start,Math.floor(expected)-125);end=Math.min(end,Math.floor(expected)+126);}
       let best=-1,cost=Infinity;const desired=new Set(score[si].pitches);
       for(let mi=start;mi<end;mi++){
         if(usedMidi.has(mi))continue;
         const found=new Set(midi[mi].pitches);
         for(let n=mi+1;n<midi.length&&midi[n].second-midi[mi].second<=.4;n++)for(const p of midi[n].pitches)found.add(p);
         let hits=0;for(const p of desired)if(found.has(p))hits++;
         const recall=hits/Math.max(1,desired.size);if(recall<.8)continue;
         const score=2*(1-recall)+.075*Math.abs(mi-expected);
         if(score<cost){cost=score;best=mi;}
       }
       if(best>=0&&cost<1){pairs.set(si,best);usedMidi.add(best);}
     }
   }
   const anchors=[];
   for(const [si,mi] of [...pairs].sort((a,b)=>a[0]-b[0])){
     const anchor={beat:score[si].beat,second:midi[mi].second};
     if(!anchors.length||(anchor.beat>anchors.at(-1).beat&&anchor.second>anchors.at(-1).second))anchors.push(anchor);
   }
   const interpolated=beat=>{
     if(!anchors.length)return beat*.5;
     let lo=0,hi=anchors.length;
     while(lo<hi){const m=(lo+hi)>>>1;if(anchors[m].beat<beat)lo=m+1;else hi=m;}
     const tempo=Math.max(.01,(midi.at(-1)?.second-midi[0]?.second)/Math.max(.01,score.at(-1)?.beat-score[0]?.beat)||.5);
     if(lo<anchors.length&&Math.abs(anchors[lo].beat-beat)<1e-5)return anchors[lo].second;
     let a,b;
     if(lo===0){a=anchors[0];b=anchors[1];}
     else if(lo===anchors.length){b=anchors.at(-1);a=anchors.at(-2);}
     else{a=anchors[lo-1];b=anchors[lo];}
     if(!a)return b.second+(beat-b.beat)*tempo;
     if(!b)return a.second+(beat-a.beat)*tempo;
     const slope=(b.second-a.second)/Math.max(.000001,b.beat-a.beat);
     return a.second+(beat-a.beat)*Math.max(.05,slope);
   };
   const byPitch=new Map();events.forEach((e,i)=>{const list=byPitch.get(e.pitch)||[];list.push({...e,index:i});byPitch.set(e.pitch,list);});
   const used=new Set(),matched=[];
   for(const s of score){
     const center=interpolated(s.beat);
     for(const pitch of s.pitches){
       const list=byPitch.get(pitch)||[];let best=null,distance=Infinity;
       for(const e of list){
         if(e.second<center-.12)continue;
         if(e.second>center+.42)break;
         if(used.has(e.index))continue;
         const delta=Math.abs(e.second-center);if(delta<distance){best=e;distance=delta;}
       }
       if(best){used.add(best.index);matched.push({beat:s.beat,pitch,second:best.second,
         end_second:best.end_second??best.second,velocity:best.velocity});}
     }
   }
   const coverage=score.length?+Math.min(anchors.length/score.length,matched.length/Math.max(1,attacks.length)).toFixed(3):0;
   const status=coverage>=.9?'ok':'needs-review';
   const origins=new Map(),continuations=[];
   const ordered=[...attacks.map(a=>({...a,stop:false})),...ties.map(a=>({...a,stop:true}))]
     .sort((a,b)=>a.beat-b.beat||a.pi-b.pi);
   for(const note of ordered){const key=`${note.pi}:${note.voice}:${note.staff}:${note.pitch}`;
     if(!note.stop){if(note.types.includes('start'))origins.set(key,note.beat);continue;}
     const start=origins.get(key);
     if(start!==undefined)continuations.push({beat:note.beat,pitch:note.pitch,origin_beat:start});
     if(!note.types.includes('start'))origins.delete(key);
   }
   return {alignment:{method:'pitch-onset-anchors-v1',pitch_mode:pitchMode,status,coverage,matched_notes:matched.length,
     total_notes:attacks.length,matched_groups:anchors.length,total_groups:score.length,
     anchors,note_matches:matched,message:status==='ok'?'브라우저에서 MIDI 타건 시점을 연결했습니다.':'음표·MIDI 시간 매칭이 낮습니다. 싱크와 반복을 확인하세요.'},
     tie_continuations:continuations};
 }
 async function unpackMxl(file){
   const data=await file.arrayBuffer(),view=new DataView(data),bytes=new Uint8Array(data);
   let eocd=-1;for(let i=data.byteLength-22;i>=Math.max(0,data.byteLength-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
   if(eocd<0)throw Error('MXL ZIP 구조가 올바르지 않습니다.');
   const count=view.getUint16(eocd+10,true);let pos=view.getUint32(eocd+16,true);const entries=[];
   for(let i=0;i<count;i++){
     if(pos+46>data.byteLength||view.getUint32(pos,true)!==0x02014b50)throw Error('MXL ZIP 디렉터리가 손상되었습니다.');
     const method=view.getUint16(pos+10,true),packed=view.getUint32(pos+20,true),size=view.getUint32(pos+24,true);
     const n=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),start=view.getUint32(pos+42,true);
     const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+n));entries.push({name,method,packed,size,start});pos+=46+n+extra+comment;
   }
   async function read(entry){
     if(entry.size>50*1024*1024||entry.packed>50*1024*1024)throw Error('MXL 압축 해제 크기가 50MB를 초과합니다.');
     const at=entry.start;if(at+30>data.byteLength||view.getUint32(at,true)!==0x04034b50)throw Error('MXL 파일 항목이 손상되었습니다.');
     const start=at+30+view.getUint16(at+26,true)+view.getUint16(at+28,true);
     if(start+entry.packed>data.byteLength)throw Error('MXL 압축 데이터가 잘렸습니다.');
     const packed=bytes.slice(start,start+entry.packed);
     if(entry.method===0)return new TextDecoder().decode(packed);
     if(entry.method!==8||typeof DecompressionStream==='undefined')throw Error('이 브라우저는 MXL 압축 방식을 지원하지 않습니다.');
     const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
     return new TextDecoder().decode(await new Response(stream).arrayBuffer());
   }
   let target=entries.find(e=>e.name==='META-INF/container.xml');
   if(target){const container=new DOMParser().parseFromString(await read(target),'application/xml');
     const path=Array.from(container.getElementsByTagName('*')).find(e=>e.localName==='rootfile')?.getAttribute('full-path');
     target=entries.find(e=>e.name===path);
   }else target=null;
   target ||=entries.find(e=>/\.(xml|musicxml)$/i.test(e.name)&&!e.name.startsWith('META-INF/'));
   if(!target)throw Error('MXL에 MusicXML 파일이 없습니다.');
   return read(target);
 }
 async function prepare(scoreFile,timing){
   const raw=/\.mxl$/i.test(scoreFile.name)?await unpackMxl(scoreFile):await scoreFile.text();
   if(raw.length>50*1024*1024)throw Error('MusicXML이 50MB를 초과합니다.');
   const xml=parse(raw);
   const chooseAlignment=x=>{
     const concert=align(x,timing,{pitchMode:'concert'});
     if(!partCatalog(x).some(p=>p.transpositions.some(t=>t.semitones!==0)))return concert;
     const written=align(x,timing,{pitchMode:'written'});
     // MIDI exports vary: many use concert pitch, a few keep written pitch.
     // Prefer concert pitch unless written mode has genuinely more matches.
     return written.alignment.matched_notes>=concert.alignment.matched_notes+Math.max(1,Math.ceil(concert.alignment.total_notes*.035))&&
       written.alignment.coverage>concert.alignment.coverage+.04?written:concert;
   };
   const original=chooseAlignment(xml);
   let best=original,playback=raw,repeat_info={mode:'written',expanded:false,warning:'',analysis_version:1};
   try{
     const expanded=unfoldRepeats(xml);
     if(expanded.changed){
       const candidate=chooseAlignment(expanded.xml),oldHits=original.alignment.matched_notes,newHits=candidate.alignment.matched_notes;
       const extra=Math.max(0,candidate.alignment.total_notes-original.alignment.total_notes);
       if((newHits>=oldHits+2&&newHits>=oldHits*1.12&&candidate.alignment.coverage>=.68) ||
          (extra>=2&&newHits-oldHits>=Math.max(2,Math.ceil(extra*.7))&&newHits/timing.note_count>=.92&&candidate.alignment.coverage>=.90)){
         best=candidate;playback=new XMLSerializer().serializeToString(expanded.xml);
         repeat_info={mode:'unfolded',expanded:true,source_measures:children(children(xml.documentElement,'part')[0],'measure').length,
           playback_measures:expanded.order.length,warning:'MIDI 연주에 맞춰 되돌이표를 전개했습니다.',analysis_version:1};
       }else repeat_info.warning='MIDI에서 반복 연주를 확인하지 못해 원본 마디 순서를 사용합니다.';
     }
   }catch(error){repeat_info.warning='반복 전개 제한: '+error.message;}
   return {score:playback,original:raw,title:title(xml),staff_groups:partCatalog(parse(playback)),...best,repeat_info};
 }
 root.ScoreLocalMusicXML={parse,partCatalog,transpositionAt,scoreNotes,align,unfoldRepeats,prepare};
})(typeof window!=='undefined'?window:globalThis);
