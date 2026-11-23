/* ScoreMotion: bounded offline Salamander synthesis streamed to AAC while video renders.
   Generated MIDI only; uploaded audio stays on the existing decode path. */
import {AudioSample} from './mediabunny.min.mjs';

export const SAMPLE_RATE=48000;
export const CHUNK_SECONDS=8;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assertActive(signal,shouldCancel){
  if(signal?.aborted||shouldCancel?.())throw Error('Cancelled');
}
export function eventEnvelope(event,duration){
  const from=Math.max(0,Number(event.second)||0);
  const until=Math.min(duration,Math.max(from+.08,Number(event.sustain_end_second||event.end_second||from+.5)));
  const velocity=clamp((Number(event.velocity)||0)/127,.06,1);
  const amp=.24*velocity;
  return {from,until,stop:Math.min(duration,until+.24),amp,
    times:[from,from+.012,Math.max(from+.012,until-.09),until+.2],values:[0,amp,amp,0]};
}
export function envelopeAt(env,t){
  const times=env.times,values=env.values;
  if(t<=times[0]||t>=times[3])return 0;
  for(let i=1;i<times.length;i++){
    if(t<=times[i]){
      const span=times[i]-times[i-1];
      return span>0?values[i-1]+(values[i]-values[i-1])*(t-times[i-1])/span:values[i];
    }
  }
  return 0;
}
export function scheduleChunkNote(offline,event,sample,chunkStart,chunkEnd,duration){
  const env=eventEnvelope(event,duration);
  const onset=Math.max(chunkStart,env.from);
  const stop=Math.min(chunkEnd,env.stop);
  if(onset>=stop)return false;
  const rate=2**((Number(event.pitch)-sample.pitch)/12);
  const offset=Math.max(0,(onset-env.from)*rate);
  if(offset>=sample.buffer.duration*0.999999)return false;
  const source=offline.createBufferSource();
  source.buffer=sample.buffer;source.playbackRate.value=rate;
  const gain=offline.createGain();
  const localStart=onset-chunkStart;
  gain.gain.setValueAtTime(envelopeAt(env,onset),localStart);
  for(let i=1;i<env.times.length;i++){
    const t=env.times[i];
    if(t<=onset||t>=stop)continue;
    const local=t-chunkStart;
    if(i===2)gain.gain.setValueAtTime(env.values[i],local);
    else gain.gain.linearRampToValueAtTime(env.values[i],local);
  }
  // Keep the exact envelope slope when the chunk boundary occurs mid-ramp.
  if(stop<env.times[3]&&stop>env.times[2]){
    gain.gain.linearRampToValueAtTime(envelopeAt(env,stop),stop-chunkStart);
  }else if(stop>onset&&stop<env.times[1]){
    gain.gain.linearRampToValueAtTime(envelopeAt(env,stop),stop-chunkStart);
  }
  source.connect(gain).connect(offline.destination);
  source.start(localStart,offset);
  source.stop(stop-chunkStart);
  return true;
}

export async function* renderGeneratedChunks(meta,{signal,shouldCancel=()=>false,chunkSeconds=CHUNK_SECONDS,onProgress=()=>{}}={}){
  const local=window.ScoreLocalProjects;
  if(!local?.enabled||!local.getPianoSample||!local.pianoSampleKey)
    throw Error('브라우저 Salamander 샘플 로더를 사용할 수 없습니다.');
  const duration=Number(meta.audio_duration_sec)||0;
  if(!Number.isFinite(duration)||duration<=0||duration>600)throw Error('지원하지 않는 MIDI 음원 길이입니다.');
  const events=meta.note_events||[];
  if(events.length>12000)throw Error('12,000개를 초과하는 MIDI는 음원을 업로드해 주세요.');
  const unique=new Map();
  for(const e of events){const k=local.pianoSampleKey(e.pitch);if(!unique.has(k))unique.set(k,e.pitch);}
  const sources=new Map();let decoder=null;
  const prepareStart=performance.now();
  try{
    const decoderContext=()=>decoder||(decoder=new AudioContext({sampleRate:44100}));
    const tasks=[...unique],workers=Math.min(4,tasks.length);let next=0;
    const results=await Promise.allSettled(Array.from({length:workers},async()=>{
      while(next<tasks.length){
        assertActive(signal,shouldCancel);
        const [key,pitch]=tasks[next++];
        sources.set(key,await local.getPianoSample(pitch,decoderContext()));
      }
    }));
    const failed=results.find(x=>x.status==='rejected');if(failed)throw failed.reason;
    const sampleLoadMs=Math.round(performance.now()-prepareStart);
    const totalFrames=Math.ceil(duration*SAMPLE_RATE);
    const chunkFrameCount=Math.max(SAMPLE_RATE,Math.round(clamp(chunkSeconds,2,16)*SAMPLE_RATE));
    const totalChunks=Math.ceil(totalFrames/chunkFrameCount);
    let processed=0;
    for(let index=0,frameStart=0;frameStart<totalFrames;index++,frameStart+=chunkFrameCount){
      assertActive(signal,shouldCancel);
      const frames=Math.min(chunkFrameCount,totalFrames-frameStart);
      const chunkStart=frameStart/SAMPLE_RATE,chunkEnd=(frameStart+frames)/SAMPLE_RATE;
      const offline=new OfflineAudioContext(2,frames,SAMPLE_RATE);
      let scheduled=0;
      for(const event of events){
        const source=sources.get(local.pianoSampleKey(event.pitch));
        if(source&&scheduleChunkNote(offline,event,source,chunkStart,chunkEnd,duration))scheduled++;
      }
      const start=performance.now();
      const rendered=await offline.startRendering();
      assertActive(signal,shouldCancel);
      processed+=scheduled;
      onProgress({chunk:index+1,totalChunks,seconds:chunkEnd,duration,notesScheduled:processed,
        renderMs:Math.round(performance.now()-start),sampleLoadMs});
      yield {buffer:rendered,frameStart,frames,chunk:index+1,totalChunks};
      // Let the UI and video frame loop receive work between chunks.
      await delay(0);
    }
  }finally{
    sources.clear();
    if(decoder)await decoder.close();
  }
}

export async function encodeGeneratedPianoAac(source,meta,duration,shouldCancel,signal,onProgress=()=>{},getVideoSeconds=()=>0){
  const started=performance.now();let chunks=0,frames=0,audioAheadMax=0;
  for await(const piece of renderGeneratedChunks(meta,{signal,shouldCancel,onProgress})){
    const buffer=piece.buffer;
    const portionFrames=SAMPLE_RATE*2;
    for(let offset=0;offset<buffer.length;offset+=portionFrames){
      assertActive(signal,shouldCancel);
      const count=Math.min(portionFrames,buffer.length-offset);
      // Avoid outrunning the video muxer and buffering many minutes of AAC packets.
      const time=(piece.frameStart+offset)/SAMPLE_RATE;
      let lastWait=performance.now();
      while(time>getVideoSeconds()+16){
        assertActive(signal,shouldCancel);
        await delay(80);
        if(performance.now()-lastWait>10000){
          onProgress({waitingForVideo:true,seconds:time,duration});lastWait=performance.now();
        }
      }
      audioAheadMax=Math.max(audioAheadMax,time-getVideoSeconds());
      const data=new Float32Array(count*2);
      buffer.copyFromChannel(data.subarray(0,count),0,offset);
      buffer.copyFromChannel(data.subarray(count,count*2),1,offset);
      const sample=new AudioSample({format:'f32-planar',sampleRate:SAMPLE_RATE,
        numberOfChannels:2,numberOfFrames:count,timestamp:time,data});
      try{await source.add(sample);}finally{sample.close();}
      frames+=count;
    }
    chunks++;
    onProgress({chunk:chunks,totalChunks:piece.totalChunks,seconds:frames/SAMPLE_RATE,duration,audioAheadMax});
  }
  return {chunks,frames,duration:frames/SAMPLE_RATE,sampleRate:SAMPLE_RATE,channels:2,
    generated:true,audioAheadMax,wallMs:Math.round(performance.now()-started)};
}
