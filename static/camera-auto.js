/* Deterministic, score-anchored camera suggestions for Interactive View.
   The editor stores these as ordinary camera points, so preview and MP4 use
   the same existing camera path renderer. */
(function(root){
  'use strict';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function suggest(notes,{duration=0,existing=[]}={}){
    const sorted=(Array.isArray(notes)?notes:[]).filter(n=>n?.scoreKey&&Number.isFinite(n.audio)
      &&Number.isFinite(n.pitch)&&Number.isFinite(n.noteX)&&Number.isFinite(n.noteY))
      .sort((a,b)=>a.audio-b.audio||a.pitch-b.pitch);
    if(!sorted.length)return [];
    const groups=[];
    for(const note of sorted){
      const last=groups.at(-1);
      if(last&&Math.abs(note.audio-last.time)<=.075&&note.systemKey===last.systemKey)last.notes.push(note);
      else groups.push({time:note.audio,notes:[note]});
    }
    const times=groups.map(g=>g.time),end=Math.max(Number(duration)||0,times.at(-1)||0);
    const velocities=sorted.map(n=>Number(n.velocity)||64).sort((a,b)=>a-b);
    const median=velocities[Math.floor(velocities.length/2)]||64;
    const upper=velocities[Math.floor(velocities.length*.85)]||median;
    const candidates=groups.map((group,index)=>{
      const notes=group.notes,high=notes.reduce((a,b)=>a.pitch>b.pitch?a:b);
      const low=notes.reduce((a,b)=>a.pitch<b.pitch?a:b);
      const center=(high.pitch+low.pitch)/2;
      const prev=groups[index-1],prevCenter=prev?(Math.max(...prev.notes.map(n=>n.pitch))+Math.min(...prev.notes.map(n=>n.pitch)))/2:center;
      const gap=prev?group.time-prev.time:0,leap=Math.abs(center-prevCenter);
      const velocity=Math.max(...notes.map(n=>Number(n.velocity)||64));
      const chord=notes.length>=3,phrase=gap>=.9,register=leap>=9;
      const measure=Number(high.measure)||1,measureStart=prev&&Number(prev.notes[0].measure)!==measure;
      const dynamic=upper-median>=7&&velocity>=upper;
      const strength=clamp((velocity-median)/45,0,1);
      const score=(chord?2.8+Math.min(notes.length-3,4)*.25:0)
        +(phrase?2.5+Math.min(gap-1,1)*.5:0)
        +(register?2.1+Math.min(leap-9,15)*.07:0)
        +(dynamic?1.4+strength:0)
        +(measureStart?0.35:0);
      const kind=chord?'화성':phrase?'프레이즈':register?'음역 변화':'강세';
      const focus=register&&center<prevCenter?low:high;
      const zoom=clamp(1.14+(chord?.13:0)+(register?.07:0)+(dynamic?.055:0)+Math.min(notes.length-1,5)*.012,1.14,1.48);
      return {key:focus.scoreKey,measure:focus.measure,pitch:focus.pitch,beat:focus.beat,
        time:group.time,score,kind,zoom:Number(zoom.toFixed(2)),
        duration:chord?2.0:phrase?1.7:1.45,timing:phrase?-.85:-.65,
        shake:dynamic&&chord?.08:0,auto:true};
    }).filter(p=>p.score>=1.35&&p.time>=.6&&p.time<=end-1.2);
    const manual=(Array.isArray(existing)?existing:[]).filter(p=>!p.auto&&p.key);
    const manualTimes=manual.map(p=>sorted.find(n=>n.scoreKey===p.key)?.audio).filter(Number.isFinite);
    const target=clamp(Math.round(end/9),1,24),minGap=5.2;
    const chosen=[];
    // Select across the entire piece, not just the highest-scoring opening.
    const windows=Math.max(1,target);
    for(let i=0;i<windows;i++){
      const start=end*i/windows,stop=end*(i+1)/windows;
      const pool=candidates.filter(p=>p.time>=start&&p.time<stop
        &&manualTimes.every(t=>Math.abs(t-p.time)>=minGap)
        &&chosen.every(q=>Math.abs(q.time-p.time)>=minGap));
      pool.sort((a,b)=>b.score-a.score||a.time-b.time);
      if(pool.length)chosen.push(pool[0]);
    }
    return chosen.sort((a,b)=>a.time-b.time).map(({time,score,...point})=>point);
  }
  root.ScoreCameraAuto={suggest};
})(typeof window!=='undefined'?window:globalThis);
