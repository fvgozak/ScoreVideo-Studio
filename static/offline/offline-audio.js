/* Source audio stays in the browser; no real-time playback or server conversion. */
import {AudioSample,AudioSampleSource,Quality} from './mediabunny.min.mjs';

export async function decodeProjectAudio(meta,signal){
  if(!meta?.id||!meta.audio_filename)throw Error('This project has no source audio file.');
  const fetchStart=performance.now();
  const response=await fetch(`/api/projects/${encodeURIComponent(meta.id)}/audio`,{signal});
  if(!response.ok)throw Error(`Source audio unavailable (HTTP ${response.status}).`);
  const bytes=await response.arrayBuffer(),fetchMs=performance.now()-fetchStart,inputBytes=bytes.byteLength;
  if(signal.aborted)throw Error('Cancelled');
  const context=new AudioContext({sampleRate:48000});
  try{
    const decodeStart=performance.now();
    const buffer=await context.decodeAudioData(bytes);
    if(signal.aborted)throw Error('Cancelled');
    return {buffer,fetchMs,decodeMs:performance.now()-decodeStart,inputBytes};
  }finally{await context.close();}
}

export function createAacSource(output){
  let packetCount=0;
  const source=new AudioSampleSource({codec:'aac',quality:new Quality({bitrate:192000}),
    onEncodedPacket(){packetCount++;}});
  output.addAudioTrack(source);
  return {source,get packetCount(){return packetCount;}};
}

export async function encodeAudioSamples(source,buffer,duration,shouldCancel){
  const sampleRate=buffer.sampleRate,channels=buffer.numberOfChannels;
  const totalFrames=Math.min(buffer.length,Math.round(duration*sampleRate));
  const chunkFrames=sampleRate*2;
  let chunks=0;
  for(let offset=0;offset<totalFrames;offset+=chunkFrames){
    if(shouldCancel())throw Error('Cancelled');
    const frames=Math.min(chunkFrames,totalFrames-offset);
    const data=new Float32Array(frames*channels);
    for(let channel=0;channel<channels;channel++)
      buffer.copyFromChannel(data.subarray(channel*frames,(channel+1)*frames),channel,offset);
    const sample=new AudioSample({format:'f32-planar',sampleRate,
      numberOfChannels:channels,numberOfFrames:frames,timestamp:offset/sampleRate,data});
    try{await source.add(sample);}finally{sample.close();}
    chunks++;
  }
  return {chunks,frames:totalFrames,duration:totalFrames/sampleRate,sampleRate,channels};
}
