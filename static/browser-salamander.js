/* Browser-owned Salamander piano synthesis.
 * The bundled 28 CC-BY-3.0 MP3 samples are decoded once in the user's browser.
 * Matches the Python sampler's pitch choice, note start, velocity gain, attack,
 * release and 32 kHz stereo output. No audio waveform is sent to the API.
 * Attribution: static/audio/salamander/NOTICE.txt
 */
(function(root){
  'use strict';
  const SAMPLE_RATE=32000;
  const NAMES=['A0','C1','Ds1','Fs1','A1','C2','Ds2','Fs2','A2','C3','Ds3','Fs3',
    'A3','C4','Ds4','Fs4','A4','C5','Ds5','Fs5','A5','C6','Ds6','Fs6','A6','C7','A7','C8'];
  const OFFSETS={C:0,Ds:3,Fs:6,A:9};
  const PITCHES=NAMES.map(name=>({
    pitch:12*(Number(name[name.length-1])+1)+OFFSETS[name.slice(0,-1)],name
  }));
  const cache=new Map();
  let active=null;
  const cancelled=signal=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};

  function nearestSample(pitch){
    return PITCHES.reduce((best,item)=>Math.abs(item.pitch-pitch)<Math.abs(best.pitch-pitch)?item:best,PITCHES[0]);
  }
  function durationSeconds(meta){
    const events=meta?.note_events||[];
    if(!events.length)throw Error('No MIDI notes to synthesize.');
    const last=events.reduce((end,n)=>Math.max(end,Number(n.sustain_end_second??n.end_second??(Number(n.second)+.35))),0);
    return Math.max(Number(meta.midi_duration_sec)||0,last)+1.5;
  }
  function supported(){
    return typeof OfflineAudioContext==='function'&&typeof AudioContext==='function'&&
      typeof URL?.createObjectURL==='function';
  }
  async function getSamples(names,signal){
    const context=new AudioContext({sampleRate:SAMPLE_RATE});
    try{
      await Promise.all([...names].map(async name=>{
        if(cache.has(name))return;
        cancelled(signal);
        const response=await fetch(`/static/audio/salamander/${name}.mp3`,{signal});
        if(!response.ok)throw Error(`Salamander ${name}.mp3: HTTP ${response.status}`);
        const data=await response.arrayBuffer();
        cancelled(signal);
        // decodeAudioData may consume its input ArrayBuffer.
        const sample=await context.decodeAudioData(data);
        cache.set(name,sample);
      }));
      return cache;
    }finally{await context.close();}
  }
  function toWav(buffer){
    const frames=buffer.length,channels=2,bytes=44+frames*channels*2;
    const wav=new ArrayBuffer(bytes),view=new DataView(wav);
    const writeText=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
    writeText(0,'RIFF');view.setUint32(4,bytes-8,true);writeText(8,'WAVE');
    writeText(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
    view.setUint16(22,channels,true);view.setUint32(24,SAMPLE_RATE,true);
    view.setUint32(28,SAMPLE_RATE*channels*2,true);view.setUint16(32,channels*2,true);
    view.setUint16(34,16,true);writeText(36,'data');view.setUint32(40,bytes-44,true);
    const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
    let peak=0;
    for(let i=0;i<frames;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
    const normalizer=peak>.95?.95/peak:1;
    let offset=44;
    for(let i=0;i<frames;i++){
      for(const data of [left,right]){
        const val=Math.max(-1,Math.min(1,data[i]*normalizer));
        // Use truncation to align with the Python float32 -> int16 conversion.
        view.setInt16(offset,Math.trunc(val*32767),true);offset+=2;
      }
    }
    return new Blob([wav],{type:'audio/wav'});
  }
  async function synthesize(meta,{signal,onProgress}={}){
    if(!supported())throw Error('OfflineAudioContext is unavailable in this browser.');
    const seconds=durationSeconds(meta);
    if(seconds>600)throw Error('Automatic piano audio is limited to 10 minutes.');
    const events=meta.note_events||[];
    const sampleNames=new Set(events.map(note=>nearestSample(Number(note.pitch)).name));
    onProgress?.('samples');
    await getSamples(sampleNames,signal);
    cancelled(signal);
    const offline=new OfflineAudioContext(2,Math.ceil(seconds*SAMPLE_RATE),SAMPLE_RATE);
    for(const note of events){
      cancelled(signal);
      const start=Math.max(0,Number(note.second)||0);
      if(start>=seconds)continue;
      const nearest=nearestSample(Number(note.pitch)),sample=cache.get(nearest.name);
      const rate=2**((Number(note.pitch)-nearest.pitch)/12);
      const hold=Math.max(.06,Number(note.sustain_end_second??note.end_second??(start+.35))-start);
      const playSeconds=Math.min(seconds-start,hold+1.4,(sample.length-1)/sample.sampleRate/rate);
      if(playSeconds<=0)continue;
      const velocity=Math.max(1,Math.min(127,Number(note.velocity??78)))/127;
      const gain=Math.min(.65,.12+velocity**1.4*.43);
      const source=offline.createBufferSource(),volume=offline.createGain();
      source.buffer=sample;source.playbackRate.value=rate;
      source.connect(volume);volume.connect(offline.destination);
      volume.gain.setValueAtTime(0,start);
      volume.gain.linearRampToValueAtTime(gain,start+Math.min(.006,playSeconds));
      if(hold<playSeconds)volume.gain.setTargetAtTime(0,start+hold,.22);
      source.start(start,0,playSeconds*rate);
    }
    onProgress?.('render');
    const buffer=await offline.startRendering();
    cancelled(signal);
    onProgress?.('encode');
    return {blob:toWav(buffer),duration:buffer.duration};
  }
  async function ensure(meta,options={}){
    if(active?.projectId===meta.id)return active;
    // Do not evict an existing source until the new project is successfully synthesized.
    const result=await synthesize(meta,options);
    const url=URL.createObjectURL(result.blob);
    const old=active;
    active={projectId:meta.id,blob:result.blob,url,duration:result.duration};
    if(old)URL.revokeObjectURL(old.url);
    return active;
  }
  root.ScoreBrowserSalamander={supported,durationSeconds,nearestSample,synthesize,ensure,
    get(projectId){return active?.projectId===projectId?active:null;},
    release(){if(active)URL.revokeObjectURL(active.url);active=null;}};
})(window);
