/* ScoreMotion real-time Salamander MIDI preview.
   Web Audio scheduling is independent of offline WAV/MP4 rendering. */
(function(root){
'use strict';
function clamp(v,low,high){return Math.min(high,Math.max(low,Number(v)||0));}
class Player{
  constructor(meta,{loadSample,onState}={}){
    if(!meta||!Array.isArray(meta.note_events)||typeof loadSample!=='function')throw Error('실시간 피아노: MIDI 데이터가 없습니다.');
    this.events=[...meta.note_events].filter(e=>Number.isFinite(e.second)&&Number.isFinite(e.pitch)).sort((a,b)=>a.second-b.second);
    this.duration=Math.max(0,Number(meta.audio_duration_sec)||Number(meta.midi_duration_sec)||0);
    this.loadSample=loadSample;this.onState=onState||(()=>{});
    this.ctx=null;this.position=0;this.paused=true;this.disposed=false;
    this.clockBase=0;this.from=0;this.timer=null;this.eventIndex=0;this.token=0;
    this.voices=new Set();this.samples=new Map();this.pending=new Map();this.starting=null;
    this.stats={sampleLoads:0,scheduledNotes:0,lateNotes:0,skippedNotes:0};
  }
  get currentTime(){
    if(this.paused||!this.ctx)return this.position;
    return clamp(this.from+Math.max(0,this.ctx.currentTime-this.clockBase),0,this.duration);
  }
  _signal(type){try{this.onState(type);}catch(e){console.warn('Realtime piano state:',e);}}
  _key(pitch){return root.ScoreLocalProjects?.pianoSampleKey?.(pitch)||String(pitch);}
  async _sample(pitch){
    const key=this._key(pitch);
    if(this.samples.has(key)){
      const item=this.samples.get(key);this.samples.delete(key);this.samples.set(key,item);return item;
    }
    if(this.pending.has(key))return this.pending.get(key);
    const task=(async()=>{
      const sample=await this.loadSample(pitch,this.ctx);
      if(this.disposed)throw Error('Player disposed');
      this.samples.set(key,sample);
      // Per-player cap complements the decoded-sample LRU in local-projects.js.
      while(this.samples.size>18)this.samples.delete(this.samples.keys().next().value);
      this.stats.sampleLoads++;
      return sample;
    })();
    this.pending.set(key,task);
    try{return await task;}finally{if(this.pending.get(key)===task)this.pending.delete(key);}
  }
  async _prime(start,token){
    // Load only the notes required for the first 2 seconds of playback.
    const pitches=new Map();
    for(const e of this.events){
      if(e.second>start+2)break;
      const end=Number(e.sustain_end_second??e.end_second??e.second+.5);
      if(end+.2>=start)pitches.set(this._key(e.pitch),e.pitch);
    }
    const list=[...pitches.values()];let next=0;
    await Promise.all(Array.from({length:Math.min(6,list.length)},async()=>{
      while(next<list.length){
        if(token!==this.token||this.disposed)return;
        await this._sample(list[next++]);
      }
    }));
  }
  _indexAt(time){
    let lo=0,hi=this.events.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(this.events[mid].second<time)lo=mid+1;else hi=mid;}
    return lo;
  }
  _stopVoices(){
    for(const voice of this.voices){try{voice.stop();}catch(_){ }try{voice.disconnect();}catch(_){ }}
    this.voices.clear();
  }
  _fire(note,sample,token,{held=false}={}){
    if(token!==this.token||this.paused||this.disposed||!this.ctx)return;
    const logicalStart=Math.max(0,Number(note.second));
    const logicalEnd=Math.min(this.duration,Math.max(logicalStart+.08,Number(note.sustain_end_second||note.end_second||logicalStart+.5)));
    const noteClock=this.clockBase+(logicalStart-this.from);
    const now=this.ctx.currentTime;
    const when=Math.max(now+.004,noteClock);
    const late=Math.max(0,when-noteClock);
    if((!held&&late>0.3)||logicalStart+late>logicalEnd+.15){this.stats.skippedNotes++;return;}
    const ratio=2**((Number(note.pitch)-Number(sample.pitch))/12);
    const offset=late*ratio;
    if(offset>=sample.buffer.duration){this.stats.skippedNotes++;return;}
    const source=this.ctx.createBufferSource();source.buffer=sample.buffer;source.playbackRate.value=ratio;
    const gain=this.ctx.createGain();
    const velocity=clamp((Number(note.velocity)||64)/127,.06,1),peak=.24*velocity;
    const attack=Math.max(.004,.012-late),releaseAt=Math.max(when+attack,when+(logicalEnd-logicalStart-late)-.09);
    gain.gain.setValueAtTime(late>.012?peak:0,when);
    gain.gain.linearRampToValueAtTime(peak,when+attack);
    gain.gain.setValueAtTime(peak,releaseAt);
    const stopAt=Math.max(when+attack+.01,when+logicalEnd-logicalStart-late+.24);
    gain.gain.linearRampToValueAtTime(0,Math.max(releaseAt+.001,stopAt-.04));
    source.connect(gain);gain.connect(this.ctx.destination);
    source.onended=()=>{this.voices.delete(source);try{source.disconnect();gain.disconnect();}catch(_){ }};
    this.voices.add(source);
    source.start(when,offset);source.stop(stopAt);
    this.stats.scheduledNotes++;
    if(late>.03)this.stats.lateNotes++;
  }
  _heldAt(time,token){
    // Reconstruct sustained notes after seeking into a pedal-held phrase.
    const from=Math.max(0,this._indexAt(time)-2500);
    for(let i=from;i<this.eventIndex;i++){
      const note=this.events[i];
      if(note.second<time-20)continue; // limit synthesis for extreme sustain tails
      const until=Number(note.sustain_end_second||note.end_second||note.second+.5);
      if(until+.15<=time)continue;
      const key=this._key(note.pitch),sample=this.samples.get(key);
      if(sample)this._fire(note,sample,token,{held:true});
    }
  }
  _drain(token){
    if(token!==this.token||this.paused||this.disposed)return;
    const time=this.currentTime;
    if(time>=this.duration-.003){
      this.pause();this.position=this.duration;this._signal('ended');return;
    }
    const horizon=time+.23;
    while(this.eventIndex<this.events.length&&this.events[this.eventIndex].second<=horizon){
      const note=this.events[this.eventIndex++],key=this._key(note.pitch),ready=this.samples.get(key);
      if(ready)this._fire(note,ready,token);
      else void this._sample(note.pitch).then(sample=>this._fire(note,sample,token)).catch(e=>console.warn('Realtime piano sample:',e));
    }
    // Prefetch only a bounded number of upcoming anchors; never synthesize WAV.
    let prefetched=0;
    for(let i=this.eventIndex;i<this.events.length&&this.events[i].second<time+6&&prefetched<6;i++){
      const e=this.events[i],key=this._key(e.pitch);
      if(this.samples.has(key)||this.pending.has(key))continue;
      prefetched++;
      void this._sample(e.pitch).catch(e=>console.warn('Realtime piano prefetch:',e));
    }
  }
  async prepare(){
    if(this.disposed||!this.paused)return;
    if(!this.ctx)this.ctx=new (root.AudioContext||root.webkitAudioContext)({sampleRate:44100});
    const token=this.token;
    await this._prime(this.position,token);
  }
  async play(){
    if(this.disposed)throw Error('실시간 피아노 재생기가 종료됐습니다.');
    if(!this.paused)return;
    if(this.starting)return this.starting;
    const token=++this.token;
    const task=(async()=>{
      if(!this.ctx)this.ctx=new (root.AudioContext||root.webkitAudioContext)({sampleRate:44100});
      await this.ctx.resume();
      const pos=this.position>=this.duration?0:this.position;
      await this._prime(pos,token);
      if(token!==this.token||this.disposed)return;
      this.position=pos;this.from=pos;this.clockBase=this.ctx.currentTime+.045;
      this.eventIndex=this._indexAt(pos);
      this.paused=false;
      this._heldAt(pos,token);
      this._drain(token);
      this.timer=setInterval(()=>this._drain(token),35);
      this._signal('play');
    })();
    this.starting=task;
    try{await task;}finally{if(this.starting===task)this.starting=null;}
  }
  pause(){
    if(this.disposed)return;
    const wasPlaying=!this.paused;
    const wasStarting=Boolean(this.starting);
    this.starting=null;
    this.position=this.currentTime;this.paused=true;this.token++;
    if(this.timer!==null){clearInterval(this.timer);this.timer=null;}
    this._stopVoices();
    if(wasPlaying||wasStarting)this._signal('pause');
  }
  seek(time){
    if(this.disposed)return;
    const wasPlaying=!this.paused;
    this.pause();this.position=clamp(time,0,this.duration);
    if(wasPlaying)void this.play().catch(e=>console.warn('Realtime piano seek:',e));
    this._signal('seeked');
  }
  async dispose(){
    if(this.disposed)return;
    this.pause();this.disposed=true;
    this.pending.clear();this.samples.clear();
    const ctx=this.ctx;this.ctx=null;
    if(ctx&&ctx.state!=='closed')try{await ctx.close();}catch(_){ }
  }
}
root.ScoreRealtimeSalamander={Player};
})(typeof window!=='undefined'?window:globalThis);
