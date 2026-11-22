import assert from 'node:assert/strict';
import {findDirectEncoderConfig, DirectVideoEncoderSource, suggestedBitrate} from '../static/offline/direct-video-encoder.js';
import {Mp4Diagnostics} from '../static/offline/mp4-diagnostics.js';

class FakeFrame {
  static created=[];
  constructor(canvas,{timestamp,duration}){this.canvas=canvas;this.timestamp=timestamp;this.duration=duration;this.closed=false;FakeFrame.created.push(this);}
  close(){this.closed=true;}
}
class FakePacketSource {
  constructor(codec){this.codec=codec;this.packets=[];this.closed=false;}
  async add(packet,meta){await new Promise(resolve=>setTimeout(resolve,1));this.packets.push({packet,meta});}
  close(){this.closed=true;}
}
class FakeEncoder {
  static async isConfigSupported(config){return {supported:config.codec==='avc1.420028'||config.codec==='avc1.64002a'};}
  constructor({output,error}){this.output=output;this.error=error;this.state='unconfigured';this.encodeQueueSize=0;this.running=[];}
  configure(config){this.config=config;this.state='configured';}
  encode(frame,{keyFrame}){
    this.encodeQueueSize++;
    this.running.push(new Promise(resolve=>setTimeout(()=>{
      this.output({timestamp:frame.timestamp,duration:frame.duration,type:keyFrame?'key':'delta',byteLength:123},
        {decoderConfig:{codec:this.config.codec,codedWidth:this.config.width,codedHeight:this.config.height}});
      this.encodeQueueSize--;resolve();
    },2)));
  }
  async flush(){await Promise.all(this.running);}
  close(){this.state='closed';}
}
assert.equal(suggestedBitrate(1920,1080,30,'16'),16_000_000);
const config=await findDirectEncoderConfig({width:1920,height:1080,fps:30,bitrate:'16',VideoEncoderClass:FakeEncoder});
assert.equal(config.avc.format,'avc');
assert.equal(config.bitrate,16_000_000);
const diag=new Mp4Diagnostics();
const source=new DirectVideoEncoderSource({canvas:{width:1920,height:1080},fps:30,config,diagnostics:diag,
  PacketSourceClass:FakePacketSource,VideoFrameClass:FakeFrame,VideoEncoderClass:FakeEncoder,packetFromChunk:c=>({timestamp:c.timestamp/1e6,byteLength:c.byteLength,type:c.type})});
for(let i=0;i<90;i++){
  await diag.waitForEncoderRoom(16);
  await source.add(i/30,1/30);
}
await source.drain();
assert.equal(source.submittedFrames,90);
assert.equal(source.encodedPackets,90);
assert.equal(diag.unencodedFrames,0);
assert.ok(diag.peakUnencodedFrames<=16);
assert.equal(source.packetSource.packets.length,90);
assert.equal(source.packetSource.packets[0].packet.type,'key');
assert.equal(source.packetSource.packets[60].packet.type,'key');
assert.ok(Math.abs(source.packetSource.packets[89].packet.timestamp-89/30)<1e-6);
assert.ok(FakeFrame.created.every(frame=>frame.closed),'VideoFrame.close() must run on each frame');
source.close();
assert.equal(source.encoder.state,'closed');
assert.equal(source.packetSource.closed,true);
await assert.rejects(source.add(91/30,1/30),/closed/);
console.log('PASS direct VideoEncoder: frame lifetime, ordering, muxer metadata, keyframes, bounded backlog, flush, close');
