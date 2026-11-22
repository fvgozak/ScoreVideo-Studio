/* Experimental direct WebCodecs encoder for ScoreMotion.
 * Keeps Mediabunny's MP4 muxer; replaces only CanvasSource -> VideoEncoder.
 * Unlike CanvasSource.add(), encode() alone does not mean packets are ready.
 * The caller MUST enforce an encoded-packet-based backlog limit.
 */
import {EncodedVideoPacketSource, EncodedPacket} from './mediabunny.min.mjs';

const chooseCodecs=(width,height,fps)=>width*height*fps>1920*1080*60
  ?['avc1.640034']
  :width*height*fps>1920*1080*30
    ?['avc1.64002a','avc1.640034']
    :['avc1.420028','avc1.64002a','avc1.640034'];

export function suggestedBitrate(width,height,fps,bitrate='auto'){
  if(bitrate!=='auto')return Math.round(Number(bitrate)*1_000_000);
  return Math.min(100_000_000,Math.max(8_000_000,Math.round(width*height*fps*.14)));
}

export async function findDirectEncoderConfig({width,height,fps,bitrate='auto',acceleration='no-preference',VideoEncoderClass=globalThis.VideoEncoder}){
  if(!VideoEncoderClass?.isConfigSupported)throw Error('WebCodecs VideoEncoder is unavailable');
  const bits=suggestedBitrate(width,height,fps,bitrate);
  if(!Number.isFinite(bits)||bits<=0)throw Error('Invalid video bitrate');
  // Some platforms accept prefer-hardware for the initial capability probe but
  // reject the full AVC configuration. Retry without an acceleration hint.
  for(const preference of [...new Set([acceleration,'no-preference'])]){
    for(const codec of chooseCodecs(width,height,fps)){
      const config={codec,width,height,framerate:fps,bitrate:bits,hardwareAcceleration:preference,
        latencyMode:'quality',avc:{format:'avc'}};
      try{if((await VideoEncoderClass.isConfigSupported(config)).supported)return config;}
      catch(_){/* Try another AVC profile or the default acceleration preference. */}
    }
  }
  throw Error(`Direct VideoEncoder: ${width}x${height} ${fps}fps H.264 not supported (${acceleration})`);
}

export class DirectVideoEncoderSource {
  constructor({canvas,fps,config,diagnostics,
    VideoEncoderClass=globalThis.VideoEncoder,VideoFrameClass=globalThis.VideoFrame,
    PacketSourceClass=EncodedVideoPacketSource,packetFromChunk=chunk=>{
      const packet=EncodedPacket.fromEncodedChunk(chunk);
      return packet.duration>0?packet:new EncodedPacket(packet.data,packet.type,packet.timestamp,1/fps);
    },
    now=()=>performance.now()}){
    if(!VideoEncoderClass||!VideoFrameClass)throw Error('Direct WebCodecs requires VideoEncoder and VideoFrame');
    this.canvas=canvas;this.fps=fps;this.diagnostics=diagnostics;this.now=now;this.VideoFrameClass=VideoFrameClass;
    this.packetSource=new PacketSourceClass('avc');this.frameIndex=0;this.failed=null;this.closed=false;
    this.captureMs=0;this.encodeSubmitMs=0;this.peakEncodeQueue=0;this.submittedFrames=0;
    this.encodedPackets=0;this.packetWriteQueue=Promise.resolve();
    this.encoder=new VideoEncoderClass({
      output:(chunk,meta)=>{
        // WebCodecs output callbacks are in decode order. Preserve that order in the muxer.
        // Catch errors on the tail to prevent unhandled promise rejection while rendering.
        try{
          const packet=packetFromChunk(chunk);
          this.packetWriteQueue=this.packetWriteQueue.then(async()=>{
            await this.packetSource.add(packet,meta);
            this.encodedPackets++;
            this.diagnostics?.videoPacket(packet);
          }).catch(error=>{this.failed ||= error;});
        }catch(error){this.failed ||= error;}
      },
      error:error=>{this.failed ||= error instanceof Error?error:new Error(String(error));}
    });
    this.encoder.configure(config);
    this.codec=config.codec;
  }
  assertHealthy(){if(this.failed)throw this.failed;if(this.closed)throw Error('Direct VideoEncoder is closed');}
  // VideoFrame is constructed BEFORE returning (before the canvas can be repainted).
  async add(timestamp,duration){
    this.assertHealthy();
    const started=this.now();
    const frame=new this.VideoFrameClass(this.canvas,{timestamp:Math.round(timestamp*1e6),duration:Math.round(duration*1e6)});
    this.captureMs+=this.now()-started;
    try{
      this.diagnostics?.videoSample({timestamp});
      const before=this.now();
      this.encoder.encode(frame,{keyFrame:this.frameIndex%Math.max(1,Math.round(this.fps*2))===0});
      this.encodeSubmitMs+=this.now()-before;
      this.frameIndex++;this.submittedFrames++;
      this.peakEncodeQueue=Math.max(this.peakEncodeQueue,this.encoder.encodeQueueSize||0);
    }catch(error){this.failed ||= error;throw error;}
    finally{frame.close();}
  }
  async drain(){
    this.assertHealthy();
    await this.encoder.flush();
    await this.packetWriteQueue;
    this.assertHealthy();
    if(this.encodedPackets!==this.submittedFrames)
      throw Error(`Direct H.264 packet mismatch: ${this.encodedPackets}/${this.submittedFrames}`);
  }
  close(){if(this.closed)return;this.closed=true;this.encoder.close();this.packetSource.close();}
  abort(){if(this.closed)return;this.closed=true;try{this.encoder.close();}catch(_){}try{this.packetSource.close();}catch(_){}}
  snapshot(){return {codec:this.codec,submittedFrames:this.submittedFrames,encodedPackets:this.encodedPackets,
    frameCaptureAvgMs:this.submittedFrames?+(this.captureMs/this.submittedFrames).toFixed(3):0,
    encoderSubmitAvgMs:this.submittedFrames?+(this.encodeSubmitMs/this.submittedFrames).toFixed(3):0,
    encoderQueueSize:this.encoder.state==='configured'?this.encoder.encodeQueueSize:0,
    peakEncoderQueueSize:this.peakEncodeQueue,failed:this.failed?String(this.failed.message||this.failed):null};}
}
