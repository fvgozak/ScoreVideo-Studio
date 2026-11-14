import {Input, Output, BlobSource, ALL_FORMATS, Mp4OutputFormat, BufferTarget, Conversion, Quality} from './node_modules/mediabunny/dist/bundles/mediabunny.min.mjs';

const $=id=>document.getElementById(id);
let conversion=null,downloadUrl=null;
const status=value=>{$('status').textContent=typeof value==='string'?value:JSON.stringify(value,null,2);};
const supported=async()=>({
  mp4Recorder:MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01F,mp4a.40.2'),
  h264:(await VideoEncoder.isConfigSupported({codec:'avc1.42E01F',width:1280,height:720,bitrate:5_000_000,framerate:30})).supported,
  aac:(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000})).supported,
});
$('source').addEventListener('change',()=>{$('convert').disabled=!$('source').files.length;});
$('cancel').addEventListener('click',()=>{void conversion?.cancel();});
$('convert').addEventListener('click',async()=>{
  const file=$('source').files[0];if(!file)return;
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  $('download').hidden=true;$('convert').disabled=true;$('cancel').disabled=false;
  const started=performance.now(),input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  try{
    const output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
    const audioTrack=await input.getPrimaryAudioTrack();
    const audioStart=audioTrack?await audioTrack.getFirstTimestamp():0;
    conversion=await Conversion.init({input,output,trim:{start:0},video:{codec:'avc',quality:new Quality('high'),hardwareAcceleration:'no-preference'},audio:new URLSearchParams(location.search).has('videoOnly')?{discard:true}:{codec:'aac',quality:new Quality('high'),process(sample){sample.setTimestamp(sample.timestamp-audioStart);return sample;}}});
    if(!conversion.isValid)throw Error('변환 불가: '+JSON.stringify(conversion.discardedTracks));
    conversion.onProgress=progress=>status({phase:'converting',progress:Math.round(progress*100),seconds:((performance.now()-started)/1000).toFixed(1)});
    await conversion.execute();
    const blob=new Blob([output.target.buffer],{type:'video/mp4'});
    if(blob.size<4096)throw Error('MP4 출력이 비어 있습니다.');
    downloadUrl=URL.createObjectURL(blob);
    $('download').href=downloadUrl;$('download').download=file.name.replace(/\.webm$/i,'')+'.mp4';$('download').hidden=false;
    status({phase:'done',seconds:((performance.now()-started)/1000).toFixed(2),inputBytes:file.size,outputBytes:blob.size,audioStart,progress:100});
  }catch(error){status({phase:'error',message:String(error),stack:error?.stack});}finally{conversion=null;$('cancel').disabled=true;$('convert').disabled=false;await input.dispose();}
});
window.ScoreVideoMp4Prototype={supported};
