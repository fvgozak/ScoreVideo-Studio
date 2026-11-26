/* Offline symbolic score alignment. Original MIDI time is never changed. */
(function(root){
'use strict';
const MODES=['auto','v1','v2a','v2b','v2c'];
const mode=x=>MODES.includes(x)?x:'auto';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=x=>Math.round(x*1e6)/1e6;
const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[b.length>>1];};
const lower=(a,x,f)=>{let l=0,h=a.length;while(l<h){const m=(l+h)>>>1;if(f(a[m])<x)l=m+1;else h=m;}return l;};
function match(want,events){
  const counts=new Map();for(const p of want)counts.set(p,(counts.get(p)||0)+1);
  const hits=[];for(const e of events){const n=counts.get(e.pitch)||0;if(n){hits.push(e);counts.set(e.pitch,n-1);}}
  return hits;
}
function grouped(events){
  const out=[];for(const e of events){const g=out.at(-1);
    // A very small onset cluster, not an assumed notated chord.
    if(!g||e.second-g.second>.018||g.events.some(x=>x.pitch===e.pitch&&e.second-x.second>.0015))out.push({second:e.second,events:[]});
    out.at(-1).events.push(e);
  }return out;
}
function summarize(score,timing,pairs,method,requested,extra={}){
  const notes=score.groups,anchors=[],note_matches=[],byGroup=new Map();
  for(const p of pairs){if(!p.hits.length)continue;const s=notes[p.i],second=Math.min(...p.hits.map(e=>e.second));
    if(!anchors.length||second>anchors.at(-1).second){anchors.push({beat:s.beat,second});}
    byGroup.set(p.i,p.hits.length);
    for(const e of p.hits)note_matches.push({beat:s.beat,pitch:e.pitch,second:e.second,end_second:e.end_second??e.second,velocity:e.velocity});
  }
  const total=notes.reduce((a,g)=>a+g.pitches.length,0),coverage=Math.min(anchors.length/Math.max(1,notes.length),note_matches.length/Math.max(1,total));
  const precision=note_matches.length/Math.max(1,timing.note_events.length);
  const starts=score.measureStarts||[], measures=[];let mi=0;
  if(starts.length>1){for(let i=0;i<notes.length;i++){while(mi+1<starts.length-1&&notes[i].beat>=starts[mi+1]-1e-6)mi++;
    const m=measures[mi]||(measures[mi]={measure:mi+1,total_notes:0,matched_notes:0,total_groups:0,matched_groups:0});
    m.total_notes+=notes[i].pitches.length;m.matched_notes+=byGroup.get(i)||0;m.total_groups++;m.matched_groups+=byGroup.has(i)?1:0;
  }}
  // A severe local timing jump can be either an alignment error or musical
  // expression (e.g. fermata). Report it as a review hint, never as proof.
  const slopes=anchors.slice(1).map((b,i)=>(b.second-anchors[i].second)/(b.beat-anchors[i].beat));
  for(let i=0;i<slopes.length;i++){
    const nearby=slopes.slice(Math.max(0,i-4),i).concat(slopes.slice(i+1,i+5));
    if(nearby.length<4)continue;
    const typical=median(nearby);if(typical<=0||slopes[i]/typical>=.18&&slopes[i]/typical<=5)continue;
    const beat=anchors[i+1].beat,k=clamp(lower(starts,beat+1e-6,x=>x)-1,0,Math.max(0,starts.length-2));
    if(measures[k])measures[k].timing_jumps=(measures[k].timing_jumps||0)+1;
  }
  const measure_diagnostics=measures.filter(Boolean).map(m=>({...m,coverage:round(Math.min(m.matched_notes/m.total_notes,m.matched_groups/m.total_groups)),status:m.matched_notes===m.total_notes&&!m.timing_jumps?'ok':m.matched_notes/m.total_notes>=.8?'warning':'needs-review'}));
  const gaps=measure_diagnostics.filter(m=>m.status!=='ok').length;
  const status=coverage>=.9&&precision>=.85&&!measure_diagnostics.some(m=>m.status==='needs-review')&&!timing.velocity_events_truncated&&!extra.limited?'ok':'needs-review';
  return {method,requested_mode:requested,status,matched_groups:anchors.length,total_groups:notes.length,matched_notes:note_matches.length,total_notes:total,coverage:round(coverage),midi_precision:round(precision),anchors,note_matches,measure_diagnostics,review_measures:gaps,...extra,
    message:status==='ok'?'Score/MIDI alignment applied.':'Score/MIDI alignment needs review (missing/extra notes, uncertain timing or analysis limit).'};
}
function beatAlign(score,timing,events,requested){
  const byBeat=[...events].filter(e=>Number.isFinite(e.beat)).sort((a,b)=>a.beat-b.beat||a.second-b.second),used=new Set(),pairs=[];
  const offset=byBeat.length&&score.groups.length?byBeat[0].beat-score.groups[0].beat:0;
  // Compare both zero offset and a possible leading MIDI rest. Never rescale beats.
  function run(shift){used.clear();pairs.length=0;
    for(let i=0;i<score.groups.length;i++){const s=score.groups[i],b=s.beat+shift,tol=.035;let j=lower(byBeat,b-tol,e=>e.beat);const candidates=[];
      while(j<byBeat.length&&byBeat[j].beat<=b+tol){const e=byBeat[j++];if(!used.has(e))candidates.push(e);}
      candidates.sort((a,b2)=>Math.abs(a.beat-b)-Math.abs(b2.beat-b)||a.second-b2.second);
      const hits=match(s.pitches,candidates);for(const e of hits)used.add(e);if(hits.length)pairs.push({i,hits});
    }return summarize(score,timing,pairs,'score-beat-v2a',requested,{beat_offset:round(shift)});
  }
  const a=run(0);if(Math.abs(offset)<.001)return a;const b=run(offset);return b.matched_notes>a.matched_notes?b:a;
}
// Banded global sequence alignment with bounded memory and monotonic event consumption.
// Every match can consume several MIDI onset clusters for a notated arpeggio.
function sequence(score,timing,events,requested,flexible){
  const s=score.groups,g=grouped(events),n=s.length,m=g.length;
  if(!n||!m)return summarize(score,timing,[],'adaptive-sequence-v2',requested);
  const maxCells=10000000, band=Math.min(256,Math.max(flexible?96:48,Math.ceil(Math.abs(n-m)*.18),Math.ceil(Math.max(n,m)*.005)),Math.floor((maxCells/(n+1)-1)/2));
  if(band<12)return null;
  const maxMerge=flexible?8:5,spread=flexible?.65:.42,skip=flexible?.79:1.02;
  // Precompute pitch multisets for candidate arpeggio spans, bounded per onset.
  const spans=g.map((x,j)=>{const a=[];let ev=[];for(let k=1;k<=maxMerge&&j+k<=m;k++){
    const next=g[j+k-1];if(next.second-x.second>spread)break;
    ev=ev.concat(next.events);if(ev.length>48&&k>1)break;
    const counts=new Uint8Array(128);for(const e of ev)if(counts[e.pitch]<255)counts[e.pitch]++;
    a.push({events:ev,counts,size:ev.length});
  }return a;});
  const want=s.map(x=>{const c=new Map();for(const p of x.pitches)c.set(p,(c.get(p)||0)+1);return [...c];});
  const startBeat=s[0].beat,endBeat=s.at(-1).beat,first=g[0].second,last=g.at(-1).second;
  const rough=i=>first+(last-first)*(s[i].beat-startBeat)/Math.max(.001,endBeat-startBeat);
  function pass(previous){
    const trace=[],starts=new Int32Array(n+1);let prev=null,prevL=0,prevH=-1;
    const points=previous?.filter(p=>p.hits.length===s[p.i].pitches.length).map(p=>({i:p.i,t:p.hits[0].second,j:p.j}))||[];
    function guide(i){
      if(points.length<4)return {t:rough(i),scale:Math.max(.2,(last-first)/Math.max(1,endBeat-startBeat)),weight:.09};
      const z=lower(points,i,p=>p.i),a=points[Math.max(0,z-3)],b=points[Math.min(points.length-1,z+2)];
      if(a.i===b.i)return {t:rough(i),scale:.5,weight:.09};
      const slope=clamp((b.t-a.t)/Math.max(.001,s[b.i].beat-s[a.i].beat),.045,12);
      return {t:a.t+(s[i].beat-s[a.i].beat)*slope,scale:slope,weight:.55};
    }
    for(let i=0;i<=n;i++){
      const center=Math.round(i*m/n),l=Math.max(0,center-band),h=Math.min(m,center+band),row=new Float64Array(h-l+1),tr=new Int8Array(h-l+1);row.fill(Infinity);starts[i]=l;trace.push(tr);
      const target=i?guide(i-1):null;
      for(let j=l;j<=h;j++){
        const z=j-l;if(i===0&&j===0){row[z]=0;continue;}
        let best=Infinity,op=0;
        if(j>l&&row[z-1]+skip<best){best=row[z-1]+skip;op=-1;}
        if(i&&j>=prevL&&j<=prevH&&prev[j-prevL]+1.05<best){best=prev[j-prevL]+1.05;op=-2;}
        if(i&&j){const size=s[i-1].pitches.length;
          for(let k=1;k<=Math.min(j,size>1?maxMerge:1);k++){
            const q=j-k;if(q<prevL||q>prevH||!Number.isFinite(prev[q-prevL]))continue;
            const span=spans[q]?.[k-1];if(!span)continue;
            let hit=0;for(const [p,c] of want[i-1])hit+=Math.min(c,span.counts[p]);
            if(!hit)continue;
            // Missing/extra pitches and unused onset clusters are explicit costs.
            const mismatch=1.7*(size-hit)/size+1.15*(span.size-hit)/Math.max(1,span.size);
            const time=target.weight*Math.min(1.6,Math.abs(g[q].second-target.t)/Math.max(.09,target.scale*.55));
            const cost=prev[q-prevL]+mismatch+.10*(k-1)+time;
            if(cost<best){best=cost;op=k;}
          }
        }row[z]=best;tr[z]=op;
      }prev=row;prevL=l;prevH=h;
    }
    if(!Number.isFinite(prev[m-prevL]))return null;
    const result=[];let i=n,j=m;
    while(i||j){const op=trace[i][j-starts[i]];if(op>0){const q=j-op,hits=match(s[i-1].pitches,spans[q][op-1].events);result.push({i:i-1,j:q,hits});i--;j=q;}
      else if(op===-1)j--;else if(op===-2)i--;else return null;}
    return result.reverse();
  }
  const initial=pass(null);if(!initial)return null;
  const refined=pass(initial)||initial;
  return summarize(score,timing,refined,flexible?'adaptive-sequence-v2c':'adaptive-sequence-v2b',requested,{band_width:band,alignment_passes:2});
}
function analyze(score,timing,requested='auto',legacy){
  requested=mode(requested);if(requested==='v1')return {...legacy(score,timing),requested_mode:'v1'};
  const events=[...timing.note_events].filter(e=>Number.isFinite(e.second)&&Number.isInteger(e.pitch)&&e.pitch>=0&&e.pitch<128).sort((a,b)=>a.second-b.second||a.pitch-b.pitch);
  if(requested==='v2a')return beatAlign(score,timing,events,requested);
  let beat=null;if(requested==='auto'){
    beat=beatAlign(score,timing,events,requested);
    if(beat.coverage>=.985&&beat.midi_precision>=.985&&beat.status==='ok')return beat;
  }
  let result=sequence(score,timing,events,requested,requested==='v2c');
  if(requested==='auto'&&result&&(result.coverage<.95||result.midi_precision<.92)){
    const flexible=sequence(score,timing,events,requested,true);
    const quality=x=>x?2*x.coverage*x.midi_precision/Math.max(.001,x.coverage+x.midi_precision):0;
    if(quality(flexible)>quality(result)+.002)result=flexible;
    if(quality(beat)>quality(result)+.02)result=beat;
  }
  if(result)return result;
  // Never silently claim success when the bounded DP cannot be computed.
  const old=legacy(score,timing);return {...old,requested_mode:requested,status:'needs-review',limited:true,message:'Adaptive alignment exceeded its search limit; legacy alignment shown. Review synchronization.'};
}
root.ScoreAlignmentV2={analyze,mode};
})(typeof self!=='undefined'?self:globalThis);
