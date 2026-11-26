/* ScoreMotion Melody Highlight (beta) – deterministic, browser-local analysis. */
(function(root){
'use strict';
const $=id=>root.document?.getElementById?.(id)||null;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const defaultState=()=>({enabled:false,algorithm:"v1",sensitivity:65,melodyGain:170,otherGain:25,overrides:{}});
let state=defaultState(),projectId=null,stageProvider=null,saveCallback=null,initialized=false,selectKey='';
const translations={
ko:{title:'멜로디 강조 (beta)',description:'MusicXML·MIDI로 선율 후보를 찾습니다. 장식적 음형을 줄이고 멜로디의 빛을 강조합니다.',enabled:'멜로디 자동 강조 사용',sensitivity:'선율 판별 기준',strong:'멜로디 발광 강도',weak:'그 외 음표 발광 강도',edit:'음표 클릭 수정 모드',status:'악보를 불러온 뒤 자동 판별합니다.',default:'자동',melody:'멜로디',ornament:'장식·보조',reset:'개별 수정 초기화',selected:'선택된 음표',hint:'후보는 추정 결과입니다. 클릭해 직접 교정할 수 있습니다.',count:'멜로디 후보 {a}개 / 분석 대상 {b}개',noScore:'MusicXML 악보가 필요합니다.',unselected:'편집 모드에서 음표를 클릭하세요.'},
en:{title:'Melody Highlight (beta)',description:'Estimate melodic notes from MusicXML and MIDI; soften ornamentation and emphasize the melody.',enabled:'Enable automatic melody emphasis',sensitivity:'Melody confidence threshold',strong:'Melody glow intensity',weak:'Other note glow intensity',edit:'Click-to-correct mode',status:'Load a score to analyze notes.',default:'Auto',melody:'Melody',ornament:'Ornament / supporting',reset:'Clear manual corrections',selected:'Selected note',hint:'These are estimates; click notes to correct them.',count:'Melody candidates: {a} / {b} notes',noScore:'MusicXML score required.',unselected:'Click a note in edit mode.'},
ja:{title:'メロディ強調 (beta)',description:'MusicXMLとMIDIから旋律候補を推定し、装飾音を抑えて旋律の光を強調します。',enabled:'自動メロディ強調',sensitivity:'旋律判定のしきい値',strong:'メロディの発光強度',weak:'その他の音の発光強度',edit:'音符クリック修正モード',status:'楽譜を読み込むと自動で分析します。',default:'自動',melody:'メロディ',ornament:'装飾・伴奏',reset:'手動修正をクリア',selected:'選択した音符',hint:'解析結果は推定です。音符をクリックして修正できます。',count:'旋律候補 {a} / 全 {b} 音',noScore:'MusicXML楽譜が必要です。',unselected:'編集モードで音符をクリックしてください。'}
};
Object.assign(translations.ko,{algorithm:'자동 판별 알고리즘',v1:'V1 · 기존 휴리스틱',v2a:'V2-A · 음악인지 기반 (실험)',hint:'자동 추정 결과입니다. 음표별 수동 교정 UI는 추후 제공됩니다.',analyzing:'멜로디 분석 중…',legacy:'기존 수동 교정이 적용된 프로젝트입니다.'});
Object.assign(translations.en,{algorithm:'Automatic detection algorithm',v1:'V1 · Original heuristic',v2a:'V2-A · Perceptual (experimental)',hint:'Automatic estimates. Manual note editing will be available later.',analyzing:'Analyzing melody…',legacy:'Existing manual corrections are applied.'});
Object.assign(translations.ja,{algorithm:'自動判定アルゴリズム',v1:'V1 · 従来のヒューリスティック',v2a:'V2-A · 音楽知覚ベース（実験）',hint:'自動推定結果です。音符の手動修正UIは今後提供予定です。',analyzing:'旋律を分析中…',legacy:'既存の手動修正が適用されています。'});
Object.assign(translations.ko,{v2b:'V2-B · 엔트로피 / 반복성 (실험)',v2c:'V2-C · 선율 경로 추적 (실험)',v2d:'V2-D · 성부 분리 (실험)'});
Object.assign(translations.en,{v2b:'V2-B · Entropy / repetition (experimental)',v2c:'V2-C · Melody path (experimental)',v2d:'V2-D · Voice separation (experimental)'});
Object.assign(translations.ja,{v2b:'V2-B · エントロピー / 反復（実験）',v2c:'V2-C · 旋律経路追跡（実験）',v2d:'V2-D · 声部分離（実験）'});
function t(k){const lang=String(root.ScoreI18n?.locale||root.document?.documentElement?.lang||'ko').slice(0,2);return (translations[lang]||translations.ko)[k]||translations.ko[k]||k;}
function normalize(value){
  const v=value&&typeof value==='object'?value:{};
  const allowed={};
  if(v.overrides&&typeof v.overrides==='object'&&!Array.isArray(v.overrides)){
    let n=0;for(const [key,role] of Object.entries(v.overrides)){
      if(n++>=30000)break;
      if(key.length<=140&&!['__proto__','constructor','prototype'].includes(key)&&(role==='melody'||role==='ornament'))allowed[key]=role;
    }
  }
  return {enabled:v.enabled===true,algorithm:advancedAlgorithms.has(v.algorithm)?v.algorithm:'v1',sensitivity:clamp(Number(v.sensitivity)||65,30,95),
    melodyGain:clamp(Number.isFinite(Number(v.melodyGain))?Number(v.melodyGain):170,0,300),otherGain:clamp(Number.isFinite(Number(v.otherGain))?Number(v.otherGain):25,0,100),overrides:allowed};
}
function stableGroup(note){return String(note.groupKey||`${note.hand||'staff'}:${Number.isFinite(note.staffId)?note.staffId:'unknown'}`);}
// SCOREMOTION_MELODY_ACCOMPANIMENT_V1
// Detect repeated bass -> chord ("oom-pah") figures within one staff/part.
// Do not penalize a staff just because it is the left hand: a true left-hand
// melody must stay eligible. Runs in O(notes) with bounded local windows.
function accompanimentPenalties(group){
  const onsets=[];
  for(const note of group){
    const prev=onsets[onsets.length-1];
    const beat=Number(note.beat);
    const same=prev&&(
      (Number.isFinite(beat)&&Number.isFinite(prev.beat)&&Math.abs(beat-prev.beat)<=.035)
      ||Math.abs(Number(note.audio)-prev.audio)<=.035);
    if(same){
      prev.notes.push(note);
      prev.minPitch=Math.min(prev.minPitch,Number(note.pitch));
      prev.maxPitch=Math.max(prev.maxPitch,Number(note.pitch));
    }else{
      onsets.push({notes:[note],audio:Number(note.audio),beat:Number.isFinite(beat)?beat:NaN,
        minPitch:Number(note.pitch),maxPitch:Number(note.pitch)});
    }
  }
  const reductions=new Map();
  for(let i=0;i<onsets.length;i++){
    const nearby=onsets.slice(Math.max(0,i-7),Math.min(onsets.length,i+8));
    if(nearby.length<7)continue;
    const chords=nearby.filter(o=>o.notes.length>=2&&o.maxPitch-o.minPitch<=22);
    if(chords.length<3)continue;
    const chordPitches=chords.map(o=>o.minPitch).sort((a,b)=>a-b);
    const chordFloor=chordPitches[Math.floor(chordPitches.length/2)];
    const bass=nearby.filter(o=>o.notes.length===1&&o.maxPitch<=chordFloor-4);
    if(bass.length<2||(chords.length+bass.length)/nearby.length<.72)continue;
    // A repetitive rhythmic accompaniment returns to the low bass followed
    // by a chord, rather than flowing independently through a melody.
    let bassToChord=0;
    for(const b of bass){
      const k=nearby.indexOf(b);
      if(nearby.slice(k+1,k+3).some(o=>chords.includes(o)))bassToChord++;
    }
    if(bassToChord<2)continue;
    const current=onsets[i];
    const isChord=chords.includes(current),isBass=bass.includes(current);
    if(!isChord&&!isBass)continue;
    for(const note of current.notes){
      const dur=Math.max(0,Number(note.endAudio)-Number(note.audio));
      // A conspicuously sustained, independently accented note in a chord
      // can still carry the melody. Leave that exceptional top line intact.
      const typicalDur=chords.reduce((sum,o)=>sum+o.notes.reduce((a,n)=>a+Math.max(0,Number(n.endAudio)-Number(n.audio)),0)/o.notes.length,0)/chords.length;
      const typicalVel=chords.reduce((sum,o)=>sum+o.notes.reduce((a,n)=>a+(Number(n.velocity)||70),0)/o.notes.length,0)/chords.length;
      if(isChord&&note.pitch===current.maxPitch&&dur>=Math.max(.55,typicalDur*1.8)&&
        (Number(note.velocity)||70)>=typicalVel+14)continue;
      reductions.set(note,isBass?'bass':'chord');
    }
  }
  return reductions;
}

function analyzeV1(notes,options={}){
  const settings=normalize(options),groups=new Map(),valid=[];
  for(const n of notes||[]){
    if(!Number.isFinite(Number(n.audio))||!Number.isFinite(Number(n.pitch)))continue;
    valid.push(n);const key=stableGroup(n);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(n);
  }
  const scores=new Map();
  for(const group of groups.values()){
    group.sort((a,b)=>a.audio-b.audio||b.pitch-a.pitch);
    const accompaniment=accompanimentPenalties(group);
    const buckets=new Map();
    for(const note of group){const bucket=Math.floor(note.audio/2);if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(note);}
    for(let i=0;i<group.length;i++){
      const note=group[i],bid=Math.floor(note.audio/2),peers=[];
      for(let b=bid-1;b<=bid+1;b++)for(const q of buckets.get(b)||[])if(Math.abs(q.audio-note.audio)<=1.5)peers.push(q);
      const pitches=peers.map(n=>Number(n.pitch)).sort((a,b)=>a-b);
      const sortedV=peers.map(n=>Number(n.velocity)||70).sort((a,b)=>a-b);
      const pitchQ=pitches[Math.floor((pitches.length-1)*.65)]??note.pitch;
      const velQ=sortedV[Math.floor((sortedV.length-1)*.5)]??70;
      const duration=clamp(Number(note.endAudio)-Number(note.audio),.02,4);
      const long=clamp(Math.log2(1+duration/.16)/4,0,1);
      const vel=clamp(.5+(Number(note.velocity||70)-velQ)/60,0,1);
      const high=clamp(.5+(Number(note.pitch)-pitchQ)/20,0,1);
      const beat=Number(note.beat)||0;
      const metrical=Math.abs(beat-Math.round(beat))<.055?1:Math.abs(beat*2-Math.round(beat*2))<.055?.55:0;
      let continuity=0;
      // Follow coherent pitches, but do not assume that the highest note is always the melody.
      for(const direction of [-1,1]){
        for(let j=i+direction;j>=0&&j<group.length;j+=direction){
          const q=group[j],dt=Math.abs(q.audio-note.audio);
          if(dt>1.3)break;
          if(dt>.075&&Math.abs(q.pitch-note.pitch)<=7){continuity+=.5;break;}
        }
      }
      let score=clamp(.08+.31*long+.21*vel+.11*high+.13*metrical+.16*continuity,0,1);
      // Short notes inside dense runs are commonly ornamentation, except when well articulated.
      if(duration<.105&&peers.length>10&&vel<.6)score=clamp(score-.14,0,1);
      // A long, loud, on-beat bass in an oom-pah figure is accompaniment,
      // not an independent melody. Manual per-note roles still win below.
      const backing=accompaniment.get(note);
      if(backing)score=Math.min(.49,clamp(score-(backing==='bass'?.34:.32),0,1));
      scores.set(note,Math.round(score*1000)/1000);
    }
  }
  return classify(valid,settings,scores);
}
function classify(valid,settings,scores){
  const result={total:valid.length,melody:0,ornament:0,byKey:{}};
  for(const note of valid){
    const confidence=scores.get(note)||0,override=settings.overrides[note.scoreKey];
    const role=override|| (confidence*100>=settings.sensitivity?'melody':'ornament');
    const record={role,confidence,manual:Boolean(override)};
    if(note.scoreKey)result.byKey[note.scoreKey]=record;
    note.melodyHighlight=record;
    result[role]++;
  }
  return result;
}
// SCOREMOTION_MELODY_PERCEPTUAL_V2A: original rule adaptation, not a reproduction
// of the Friberg/Ahlback statistical model. Features are local and bounded.
const validNote=n=>n&&Number.isFinite(Number(n.audio))&&Number.isFinite(Number(n.pitch));
const timeOf=n=>Number.isFinite(n.midi)?n.midi:Number(n.audio);
const durationOf=n=>clamp(Number.isFinite(n.midi)?(Number.isFinite(n.midiEnd)?n.midiEnd-n.midi:.12):(Number.isFinite(Number(n.endAudio))?Number(n.endAudio)-Number(n.audio):.12),.02,12);
const velOf=n=>clamp(Number(n.velocity)||70,1,127);
const median=values=>{const a=values.slice().sort((x,y)=>x-y);return a[Math.floor(a.length/2)]??0;};
function onsetGroups(notes){
  const out=[];
  for(const n of notes){
    const t=timeOf(n),beat=Number.isFinite(n.beat)?n.beat:null,last=out[out.length-1];
    // Written onsets keep expressive chord attacks together.
    if(last&&(beat!==null&&last.beat!==null?Math.abs(beat-last.beat)<.0001:Math.abs(t-last.time)<.035))last.notes.push(n);
    else out.push({time:t,beat,notes:[n]});
  }
  for(const o of out){o.notes.sort((a,b)=>a.pitch-b.pitch||timeOf(a)-timeOf(b));o.lo=Number(o.notes[0].pitch);o.hi=Number(o.notes[o.notes.length-1].pitch);o.vel=median(o.notes.map(velOf));o.dur=median(o.notes.map(durationOf));o.peak=0;o.long=0;for(const n of o.notes){o.peak=Math.max(o.peak,velOf(n));o.long=Math.max(o.long,durationOf(n));}}
  return out;
}
const sortOnsets=list=>{const written=list.every(n=>Number.isFinite(n.beat));return list.slice().sort((a,b)=>(written?a.beat-b.beat:0)||timeOf(a)-timeOf(b)||a.pitch-b.pitch);};
function nearestPitch(o,p){
  let lo=0,hi=o.notes.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(o.notes[mid].pitch<p)lo=mid+1;else hi=mid;}
  const a=o.notes[lo],b=o.notes[lo-1];return !a?b:!b?a:Math.abs(a.pitch-p)<Math.abs(b.pitch-p)?a:b;
}
function perceptualScores(valid){
  const scores=new Map(),staffs=new Map(),lanes=new Map(),global=new Map(),backing=new Map();
  for(const n of valid){const staff=stableGroup(n),lane=staff+'|'+(n.voiceId??'unknown');
    if(!staffs.has(staff))staffs.set(staff,[]);staffs.get(staff).push(n);
    if(!lanes.has(lane))lanes.set(lane,[]);lanes.get(lane).push(n);
  }
  for(const list of staffs.values()){
    // Retain V1's useful oom-pah detector, with MIDI time to avoid sync dependence.
    const copies=list.map(n=>({...n,audio:timeOf(n),endAudio:timeOf(n)+durationOf(n),source:n})).sort((a,b)=>a.audio-b.audio||b.pitch-a.pitch);
    for(const [n,kind] of accompanimentPenalties(copies))backing.set(n.source,kind);
  }
  const all=onsetGroups(sortOnsets(valid));
  for(let i=0;i<all.length;i++){
    const o=all[i],near=all.slice(Math.max(0,i-4),i+5),v=median(near.map(x=>x.vel));
    const peak=Math.max(...near.map(x=>x.peak)),long=Math.max(...near.map(x=>x.long));
    for(const n of o.notes)global.set(n,{o,v,peak,long});
  }
  for(const list of lanes.values()){
    const os=onsetGroups(sortOnsets(list));
    for(let i=0;i<os.length;i++){
      const o=os[i],prev=os[i-1],next=os[i+1],near=os.slice(Math.max(0,i-6),i+7);
      const typicalDur=median(near.map(x=>x.dur))||.3,typicalVel=median(near.map(x=>x.vel));
      for(const n of o.notes){
        const p=Number(n.pitch),d=durationOf(n),v=velOf(n),g=global.get(n);
        const pitch=g.o.hi===g.o.lo?.72:clamp((p-g.o.lo)/(g.o.hi-g.o.lo),0,1);
        const velocity=clamp(.60+(v-(typicalVel+g.v)/2)/45,0,1);
        let continuity=0,intervals=0,movement=0;
        for(const neighbor of [prev,next]){
          if(!neighbor||Math.abs(neighbor.time-o.time)>3)continue;
          const q=nearestPitch(neighbor,p),step=Math.abs(q.pitch-p);intervals++;
          continuity+=Math.exp(-step/8);movement+=step===0?.35:step<=7?1:step<=12?.55:.2;
        }
        continuity=intervals?continuity/intervals:.65;movement=intervals?movement/intervals:.65;
        const ioi=next?Math.max(.04,next.time-o.time):prev?Math.max(.04,o.time-prev.time):typicalDur;
        const articulation=clamp(d/ioi,0,1); // legato evidence, not unlimited reward for long notes
        const duration=clamp(.58+Math.log2(d/typicalDur)*.22,0,1);
        const texture=o.notes.length===1?1:p===o.hi?.75:p===o.lo?.37:.22;
        const rhythm=clamp(Math.min(d,ioi)/.16,0,1);
        let score=.10+.20*continuity+.15*pitch+.15*velocity+.13*articulation+.10*duration+.10*texture+.06*movement+.04*rhythm;
        if(d<.105&&v<typicalVel+8&&near.length>=5)score-=.13;
        if(d<.12&&d<g.long*.4&&v<g.peak-15)score-=.16;
        // A dense chord's supporting heads should not win solely by velocity.
        if(o.notes.length>=3&&p<o.hi&&v<typicalVel+14)score-=.09;
        if(backing.has(n))score=Math.min(.49,score-.30);
        scores.set(n,Math.round(clamp(score,0,1)*1000)/1000);
      }
    }
  }
  return scores;
}
// V2-B: local entropy and transposition-tolerant repetition. Research-inspired,
// not a reproduction of Madsen/Widmer. Keep V2-A as the unmodified baseline.
const advancedAlgorithms=new Set(['v2a','v2b','v2c','v2d']);
const rounded=x=>Math.round(clamp(x,0,1)*1000)/1000;
const pc=p=>((Math.round(p)%12)+12)%12;
function entropy(values){
  if(values.length<2)return 0;
  const counts=new Map();for(const x of values)counts.set(x,(counts.get(x)||0)+1);
  let h=0;for(const count of counts.values()){const p=count/values.length;h-=p*Math.log2(p);}
  return h/Math.log2(values.length);
}
const laneKey=n=>stableGroup(n)+'|'+(n.voiceId??'unknown');
function entropyScores(valid,base=perceptualScores(valid)){
  const scores=new Map(base),lanes=new Map();
  for(const n of valid){const key=laneKey(n);if(!lanes.has(key))lanes.set(key,[]);lanes.get(key).push(n);}
  const global=onsetGroups(sortOnsets(valid)),contexts=new Map();
  // Competing music must actually sound nearby, not just exist elsewhere in the piece.
  for(let i=0;i<global.length;i++){
    const o=global[i],near=global.slice(Math.max(0,i-5),i+6),counts=new Map();
    for(const q of near)if(Math.abs(q.time-o.time)<=3)for(const n of q.notes){const k=laneKey(n);counts.set(k,(counts.get(k)||0)+1);}
    const active=[...counts.values()].filter(c=>c>=2).length;
    for(const n of o.notes)contexts.set(n,active-((counts.get(laneKey(n))||0)>=2?1:0)>0);
  }
  for(const list of lanes.values()){
    const os=onsetGroups(sortOnsets(list));
    const quant=x=>Math.round(x*4)/4;
    const delta=i=>i>0?os[i].hi-os[i-1].hi:0;
    const gap=i=>i>0?Math.max(.001,(Number.isFinite(os[i].beat)&&Number.isFinite(os[i-1].beat))?os[i].beat-os[i-1].beat:os[i].time-os[i-1].time):0;
    const shape=os.map(o=>o.notes.map(n=>n.pitch-o.lo).join(','));
    const tokens=os.map((o,i)=>`${delta(i)}:${quant(gap(i))}:${shape[i]}`);
    for(let i=0;i<os.length;i++){
      const a=Math.max(0,i-8),b=Math.min(os.length,i+9),near=os.slice(a,b);
      if(near.length<6)continue;
      const pcs=near.flatMap(o=>o.notes.map(n=>pc(n.pitch)));
      const ints=[],rhythms=[],durations=[];
      for(let j=a;j<b;j++){if(j>a){ints.push(delta(j));rhythms.push(quant(gap(j)));}const o=os[j];durations.push(quant(o.dur/Math.max(.05,j>0?o.time-os[j-1].time:o.dur)));}
      const diversity=.35*entropy(pcs)+.25*entropy(ints)+.20*entropy(rhythms)+.20*entropy(durations);
      // Exact recurring interval/rhythm/chord-shape cells; no absolute pitch needed.
      let repeat=0;
      for(let period=2;period<=8;period++){
        let same=0,total=0;for(let j=Math.max(a+period,1);j<b;j++){if(j-period<1)continue;total++;if(tokens[j]===tokens[j-period])same++;}
        if(total>=4)repeat=Math.max(repeat,same/total);
      }
      const poly=near.filter(o=>o.notes.length>1).length/near.length;
      const arpeggio=ints.length?ints.filter(x=>Math.abs(x)>=3&&Math.abs(x)<=12).length/ints.length:0;
      for(const n of os[i].notes){
        const old=base.get(n)||0;
        // Never reject a solo ostinato merely because it repeats. Repetition only
        // becomes negative evidence in a competing texture, and remains soft.
        const support=contexts.get(n)?repeat*(.35+.40*arpeggio+.25*poly)*(1-.35*diversity):0;
        scores.set(n,rounded(old+.10*(diversity-.45)-.32*support));
      }
    }
  }
  return scores;
}
// V2-C: bounded directed acyclic graph, with optional skips and restarts.
// Inspired by Simonetta et al.'s graph postprocessing, no CNN or forced monophony.
function pathScores(valid,base=entropyScores(valid)){
  const os=onsetGroups(sortOnsets(valid)),scores=new Map(base),selected=new Set();
  let best=null;const history=[];
  for(let i=0;i<os.length;i++){
    const o=os[i];
    if(i&&o.time-os[i-1].time>2.5){history.length=0;}
    const candidates=o.notes.slice().sort((a,b)=>(base.get(b)||0)-(base.get(a)||0)||b.pitch-a.pitch).slice(0,16);
    const row=[];
    for(const n of candidates){
      const confidence=base.get(n)||0,d=durationOf(n);
      if(confidence<.46)continue;
      const reward=(confidence-.57)*1.8*Math.min(1,Math.sqrt(d/.18));
      let value=reward,prev=null;
      // Restarts can follow an earlier phrase, without forcing a note at every onset.
      if(best&&o.time-best.time>=Math.max(.25,durationOf(best.note)-.03)&&best.value-.14+reward>value){value=best.value-.14+reward;prev=best;}
      for(const prior of history)for(const p of prior){
        const dt=o.time-p.time;if(dt<.001||dt>2.5)continue;
        const interval=Math.abs(n.pitch-p.note.pitch),overlap=Math.max(0,durationOf(p.note)-dt);
        const cost=.018*interval+.16*Math.min(1,overlap/.25)+.055*Math.max(0,dt-.6)+(laneKey(n)===laneKey(p.note)?0:.025);
        const continuity=.10*Math.exp(-interval/7);
        const v=p.value+reward+continuity-cost;
        if(v>value){value=v;prev=p;}
      }
      const node={note:n,time:o.time,value,prev};row.push(node);
    }
    history.push(row);if(history.length>8)history.shift();
    for(const node of row)if(!best||node.value>best.value)best=node;
  }
  for(let p=best;p&&p.value>0;p=p.prev)selected.add(p.note);
  for(const o of os){
    const principal=o.notes.find(n=>selected.has(n));
    for(const n of o.notes){
      const s=base.get(n)||0;
      const doubled=principal&&n!==principal&&Math.abs(n.pitch-principal.pitch)%12===0&&Math.abs(n.pitch-principal.pitch)>0&&Math.abs(durationOf(n)-durationOf(principal))<=Math.max(.045,durationOf(principal)*.18)&&Math.abs(velOf(n)-velOf(principal))<=20&&s>=.52;
      // A strong independent secondary line can survive; this is salience, not
      // a monophonic MIDI extractor. No automatic promotion of clear backing.
      const adjustment=selected.has(n)||doubled?(s>=.55?.085:0):s>=.79?-.025:-.075;
      scores.set(n,rounded(s+adjustment));
    }
  }
  return scores;
}
// V2-D: bounded greedy streaming voice assignment in each written staff/voice.
// Existing XML voices are respected; polyphonic or missing voice labels are split.
// This is a lightweight original heuristic, not the exact VoSA algorithm.
function inferVoices(valid){
  const groups=new Map(),result=new Map();
  for(const n of valid){const key=laneKey(n);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
  for(const [key,list] of groups){
    const os=onsetGroups(sortOnsets(list)),tracks=[];
    for(const o of os){
      const edges=[];const takenNotes=new Set(),takenTracks=new Set();
      for(const n of o.notes)for(let j=0;j<tracks.length;j++){
        const tr=tracks[j],gap=o.time-tr.time,overlap=Math.max(0,tr.end-o.time);
        if(gap<.001||gap>3||overlap>.12)continue;
        const cost=Math.abs(n.pitch-tr.pitch)+3*Math.max(0,o.time-tr.end)+30*overlap+Math.abs(Math.log2(durationOf(n)/tr.dur))*1.3;
        if(cost<=16)edges.push({n,j,cost});
      }
      edges.sort((a,b)=>a.cost-b.cost||a.j-b.j||a.n.pitch-b.n.pitch);
      const assign=(n,j)=>{tracks[j]={time:o.time,end:o.time+durationOf(n),pitch:n.pitch,dur:durationOf(n)};takenNotes.add(n);takenTracks.add(j);result.set(n,`${key}#${j}`);};
      for(const e of edges)if(!takenNotes.has(e.n)&&!takenTracks.has(e.j))assign(e.n,e.j);
      for(const n of o.notes){if(takenNotes.has(n))continue;
        let j=tracks.findIndex((tr,k)=>!takenTracks.has(k)&&o.time-tr.time>3);
        if(j<0&&tracks.length<12)j=tracks.length;
        if(j>=0)assign(n,j);else result.set(n,`${key}#overflow`);
      }
    }
  }
  return result;
}
function separatedScores(valid){
  const voices=inferVoices(valid),copies=valid.map(n=>({...n,voiceId:voices.get(n)}));
  const original=perceptualScores(valid),split=perceptualScores(copies),combined=new Map();
  // Conservative blend: split voices should not erase original evidence.
  for(let i=0;i<valid.length;i++){const a=original.get(valid[i])||0,b=split.get(copies[i])||0;combined.set(copies[i],rounded(.40*a+.60*b));}
  const scores=pathScores(copies,entropyScores(copies,combined));
  return new Map(valid.map((n,i)=>[n,scores.get(copies[i])||0]));
}
function algorithmScores(valid,algorithm){
  if(algorithm==='v2d')return separatedScores(valid);
  if(algorithm==='v2c')return pathScores(valid);
  if(algorithm==='v2b')return entropyScores(valid);
  return perceptualScores(valid);
}

function analyze(notes,options={}){
  const settings=normalize(options);
  if(settings.algorithm==='v1')return analyzeV1(notes,settings);
  const valid=(notes||[]).filter(validNote);
  return classify(valid,settings,algorithmScores(valid,settings.algorithm));
}
function gain(note,config){
  const s=config||state;
  if(s?.enabled!==true)return 1;
  const role=s.overrides?.[note?.scoreKey]||note?.melodyHighlight?.role||'ornament';
  return clamp((role==='melody'?Number(s.melodyGain):Number(s.otherGain))/100,0,3);
}
function lightColor(color,g,ink='#242633'){
  if(!/^#[0-9a-f]{6}$/i.test(color||''))return color;
  const base=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const neutral=/^#[0-9a-f]{6}$/i.test(ink)?[1,3,5].map(i=>parseInt(ink.slice(i,i+2),16)):[30,35,45];
  const gain=clamp(Number(g)||0,0,3),mix=gain<1?gain:clamp((gain-1)*.14,0,.3);
  return '#'+base.map((v,i)=>Math.round(gain<1?neutral[i]*(1-mix)+v*mix:v*(1-mix)+255*mix).toString(16).padStart(2,'0')).join('');
}
const rawCache=new WeakMap(),pendingCache=new WeakMap();
function cacheFor(cache,notes){let m=cache.get(notes);if(!m){m=new Map();cache.set(notes,m);}return m;}
function signature(s){return JSON.stringify([s.algorithm,s.sensitivity,s.overrides]);}
function annotate(notes,config){
  const s=normalize(config||state);
  if(!s.enabled)return {total:notes?.length||0,melody:0,ornament:0,byKey:{}};
  const sig=signature(s);
  if(notes?._melodyBetaSignature===sig)return notes._melodyBetaResult;
  let result;
  if(advancedAlgorithms.has(s.algorithm)&&Array.isArray(notes)){
    const valid=notes.filter(validNote);
    const cache=cacheFor(rawCache,notes);let scores=cache.get(s.algorithm);
    if(!scores){scores=algorithmScores(valid,s.algorithm);cache.set(s.algorithm,scores);}
    result=classify(valid,s,scores);
  }else result=analyze(notes,s);
  if(Array.isArray(notes)){notes._melodyBetaSignature=sig;notes._melodyBetaResult=result;}
  return result;
}
function prepare(notes,config){
  const s=normalize(config||state);
  if(!s.enabled||!advancedAlgorithms.has(s.algorithm)||!Array.isArray(notes)||!notes.length||typeof root.Worker!=='function')return Promise.resolve();
  const raw=cacheFor(rawCache,notes),pending=cacheFor(pendingCache,notes),algorithm=s.algorithm;
  if(raw.has(algorithm))return Promise.resolve();
  if(pending.has(algorithm))return pending.get(algorithm);
  const valid=notes.filter(validNote);
  const data=valid.map(n=>({audio:Number(n.audio),endAudio:Number(n.endAudio),midi:n.midi,midiEnd:n.midiEnd,beat:n.beat,pitch:Number(n.pitch),velocity:n.velocity,groupKey:n.groupKey,staffId:n.staffId,hand:n.hand,voiceId:n.voiceId}));
  let worker;
  const job=new Promise(resolve=>{
    let timer;
    const finish=values=>{
      clearTimeout(timer);worker?.terminate();
      if(pending.get(algorithm)!==job){resolve();return;}
      pending.delete(algorithm);
      const current=notes.filter(validNote);
      if(values instanceof Float32Array&&values.length===valid.length&&current.length===valid.length&&current.every((n,i)=>n===valid[i])){
        raw.set(algorithm,new Map(valid.map((n,i)=>[n,Math.round(values[i]*1000)/1000])));
      }
      resolve(); // if worker unavailable or fails, annotate uses same synchronous algorithm
    };
    try{
      worker=new root.Worker('/static/melody-worker.js?v=perceptual1&engines2bcd1');
      worker.onmessage=e=>finish(e.data?.scores);worker.onerror=()=>finish(null);worker.onmessageerror=()=>finish(null);
      timer=setTimeout(()=>finish(null),Math.min(90000,Math.max(15000,valid.length*1.5)));worker.postMessage({algorithm,notes:data});
    }catch(_){Promise.resolve().then(()=>finish(null));}
  });
  pending.set(algorithm,job);return job;
}
let redrawRevision=0;
function redraw(){
  const revision=++redrawRevision,stage=stageProvider?.(),snapshot=getState();
  syncUi();saveCallback?.();
  if(!stage?.follower)return;
  const follower=stage.follower,notes=follower.noteTriggers;
  const apply=()=>{
    if(revision!==redrawRevision||stage!==stageProvider?.()||follower!==stage.follower)return;
    // Also update Stage settings, not just the follower; config/export stay consistent.
    if(stage.settings?.effects)stage.settings.effects.melodyHighlight=snapshot;
    follower.setEffects({melodyHighlight:snapshot});stage.seek(stage.time||0);renderMarks(stage);syncUi();
  };
  if(snapshot.enabled&&advancedAlgorithms.has(snapshot.algorithm)&&!rawCache.get(notes)?.has(snapshot.algorithm)&&typeof root.Worker==='function'){
    if($('melodyStatus'))$('melodyStatus').textContent=t('analyzing');
    void prepare(notes,snapshot).then(apply);
  }else apply();
}
function getState(){return JSON.parse(JSON.stringify(state));}
function setProject(id){redrawRevision++;projectId=id||null;state=defaultState();selectKey='';syncUi();}
function restoreState(value){redrawRevision++;state=normalize(value);selectKey='';syncUi();}
function update(partial){state=normalize({...state,...partial});syncUi();redraw();}
function setRole(key,role){
  if(!key||typeof key!=='string')return;
  const overrides={...state.overrides};if(role==='melody'||role==='ornament')overrides[key]=role;else delete overrides[key];
  state={...state,overrides};selectKey=key;syncUi();redraw();
}
function renderMarks(stage){
  const notes=stage?.follower?.noteTriggers||[];
  const enabled=false; // Manual editing UI deferred; keep legacy correction data/API.
  const container=stage?.follower?.container;
  if(!container)return;
  for(const old of container.querySelectorAll('[data-melody-mark]'))old.removeAttribute('data-melody-mark');
  if(!enabled)return;
  for(const note of notes){
    const el=note.headEl||note.el;
    if(el?.setAttribute)el.setAttribute('data-melody-mark',note.scoreKey===selectKey?'selected':(note.melodyHighlight?.manual?'manual':note.melodyHighlight?.role||'ornament'));
  }
}
function syncUi(){
  if(!root.document)return;
  for(const el of root.document.querySelectorAll?.('[data-melody-i18n]')||[])el.textContent=t(el.getAttribute('data-melody-i18n'));
  const toggle=$('melodyEnabled');if(toggle)toggle.checked=state.enabled;
  const algorithm=$('melodyAlgorithm');if(algorithm)algorithm.value=state.algorithm;
  const legacy=$('melodyLegacyStatus');if(legacy){legacy.hidden=!Object.keys(state.overrides).length;legacy.textContent=t('legacy');}
  for(const [id,value] of [['melodySensitivity',state.sensitivity],['melodyGain',state.melodyGain],['melodyOtherGain',state.otherGain]]){
    const el=$(id);if(el)el.value=String(value);
    const output=$(id+'Value');if(output)output.textContent=`${value}%`;
  }
  if($('melodySelected'))$('melodySelected').textContent=selectKey||t('unselected');
  if($('melodyStatus')){
    const stage=stageProvider?.();
    const notes=stage?.follower?.noteTriggers||[];
    const count=notes.filter(n=>n.melodyHighlight?.role==='melody').length;
    $('melodyStatus').textContent=state.enabled&&notes.length?t('count').replace('{a}',String(count)).replace('{b}',String(notes.length)):t('status');
  }
}
function bindStage(stage){if(stage?.follower){annotate(stage.follower.noteTriggers,state);renderMarks(stage);syncUi();}}
function init({getStage,onChange}={}){
  stageProvider=getStage||stageProvider;saveCallback=onChange||saveCallback;
  if(initialized||!root.document)return;initialized=true;
  for(const [id,name] of [['melodyEnabled','enabled'],['melodySensitivity','sensitivity'],['melodyGain','melodyGain'],['melodyOtherGain','otherGain']]){
    const el=$(id);if(!el)continue;
    el.addEventListener('input',()=>update({[name]:name==='enabled'?el.checked:Number(el.value)}));
  }
  $('melodyAlgorithm')?.addEventListener('change',()=>update({algorithm:$('melodyAlgorithm').value}));
  syncUi();
}
root.ScoreMelodyHighlight={analyze,annotate,prepare,perceptualScores,algorithmScores,entropyScores,pathScores,inferVoices,gain,lightColor,normalize,getState,setProject,restoreState,update,setRole,bindStage,init};
})(typeof window!=='undefined'?window:globalThis);
