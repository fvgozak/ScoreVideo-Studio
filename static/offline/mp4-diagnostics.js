/* Low-overhead observability for browser MP4 exports.
 * No frame, packet, stream chunk or PCM buffer is retained by this module.
 */
const round2 = n => Math.round(n * 100) / 100;
const validStamp = seconds => Number.isFinite(Number(seconds)) ? Math.round(Number(seconds) * 1000000) : null;

export class Mp4Diagnostics {
  constructor({now=()=>performance.now()}={}) {
    this.now=now;
    this.videoSamples=0;this.videoPackets=0;this.videoPacketBytes=0;
    this.packetDelays=[];this.sampleTimes=new Map();
    this.peakUnencodedFrames=0;
    this._encoderRoomWaiters=new Set();
    this.opfsWriteCount=0;this.opfsWrittenBytes=0;this.opfsWriteMs=0;this.opfsMaxWriteMs=0;
    this.opfsCloseMs=0;this.opfsCloseCount=0;this.opfsWriteErrors=0;
    this.recentWrites=[];
    this.canvasSubmitSyncMs=0;this.canvasSubmitCount=0;
  }
  videoSample(sample){
    this.videoSamples++;
    this.peakUnencodedFrames=Math.max(this.peakUnencodedFrames,this.unencodedFrames);
    const key=validStamp(sample?.timestamp);
    if(key!==null){
      this.sampleTimes.set(key,this.now());
      // Guard against a defective callback sequence exhausting the heap.
      if(this.sampleTimes.size>512)this.sampleTimes.delete(this.sampleTimes.keys().next().value);
    }
  }
  videoPacket(packet){
    this.videoPackets++;
    // Encoder-output-driven flow control: CanvasSource.add() resolving does not
    // mean the hardware encoder has produced its packet yet.
    for(const waiter of this._encoderRoomWaiters){
      if(this.unencodedFrames<waiter.limit)waiter.resolve();
    }
    this.videoPacketBytes+=Number(packet?.byteLength)||0;
    const key=validStamp(packet?.timestamp);
    if(key!==null&&this.sampleTimes.has(key)){
      const started=this.sampleTimes.get(key);this.sampleTimes.delete(key);
      const delay=this.now()-started;
      if(delay>=0&&Number.isFinite(delay)){
        this.packetDelays.push(delay);
        if(this.packetDelays.length>100)this.packetDelays.shift();
      }
    }
  }
  get unencodedFrames(){return Math.max(0,this.videoSamples-this.videoPackets);}
  // Wait BEFORE drawing the next frame so GPU/VideoFrame resources cannot
  // grow without bound during a long render. This waits for real H.264 output,
  // not merely the resolution of CanvasSource.add().
  waitForEncoderRoom(limit,{signal,timeoutMs=90000}={}){
    if(!Number.isInteger(limit)||limit<1)throw new RangeError('Encoder backlog limit must be a positive integer.');
    if(signal?.aborted)return Promise.reject(new Error('Cancelled'));
    if(this.unencodedFrames<limit)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let timer;
      const waiter={limit,resolve:()=>finish(),reject:err=>finish(err)};
      const onAbort=()=>finish(new Error('Cancelled'));
      const finish=error=>{
        clearTimeout(timer);
        signal?.removeEventListener('abort',onAbort);
        this._encoderRoomWaiters.delete(waiter);
        if(error)reject(error);else resolve();
      };
      this._encoderRoomWaiters.add(waiter);
      signal?.addEventListener('abort',onAbort,{once:true});
      timer=setTimeout(()=>finish(new Error(
        `H.264 encoder stalled: ${this.unencodedFrames} unencoded frames after ${Math.round(timeoutMs/1000)}s.`
      )),timeoutMs);
      if(signal?.aborted)onAbort();
      else if(this.unencodedFrames<limit)waiter.resolve();
    });
  }
  canvasSubmit(ms){this.canvasSubmitCount++;this.canvasSubmitSyncMs+=ms;}
  // Mediabunny emits {type:'write',position,data}; preserve these chunks, order,
  // random-access positions and writer backpressure unchanged.
  instrumentOpfs(fileStream){
    return new WritableStream({
      write:async chunk=>{
        const started=this.now();
        try{
          await fileStream.write(chunk);
          this.opfsWriteCount++;
          this.opfsWrittenBytes+=chunk?.data?.byteLength||0;
        }catch(error){this.opfsWriteErrors++;throw error;}
        finally{
          const elapsed=this.now()-started;
          this.opfsWriteMs+=elapsed;
          this.opfsMaxWriteMs=Math.max(this.opfsMaxWriteMs,elapsed);
          this.recentWrites.push(elapsed);
          if(this.recentWrites.length>16)this.recentWrites.shift();
        }
      },
      close:async()=>{
        const started=this.now();
        try{await fileStream.close();}
        finally{this.opfsCloseCount++;this.opfsCloseMs+=this.now()-started;}
      },
      abort:reason=>fileStream.abort(reason)
    });
  }
  snapshot(){
    const n=this.packetDelays.length;
    const packetDelay=n?this.packetDelays.reduce((a,b)=>a+b,0)/n:0;
    return {
      videoSamples:this.videoSamples,videoPackets:this.videoPackets,
      videoPacketMiB:round2(this.videoPacketBytes/1048576),
      pendingPacketSamples:this.sampleTimes.size,
      // Unlike pendingPacketSamples (which caps timestamp lookup at 512),
      // this is the real number of raw samples not yet returned as packets.
      unencodedFrames:this.unencodedFrames,
      peakUnencodedFrames:this.peakUnencodedFrames,
      encoderPacketDelayMs100:n?round2(packetDelay):null,
      canvasSubmitCount:this.canvasSubmitCount,
      canvasSubmitSyncMs:this.canvasSubmitCount?round2(this.canvasSubmitSyncMs/this.canvasSubmitCount):null,
      opfsWriteCount:this.opfsWriteCount,
      opfsWrittenMiB:round2(this.opfsWrittenBytes/1048576),
      opfsWriteMs:round2(this.opfsWriteMs),
      opfsAvgWriteMs:this.opfsWriteCount?round2(this.opfsWriteMs/this.opfsWriteCount):null,
      opfsMaxWriteMs:round2(this.opfsMaxWriteMs),
      opfsRecentWriteMs:this.recentWrites.length?round2(this.recentWrites.reduce((a,b)=>a+b,0)/this.recentWrites.length):null,
      opfsCloseMs:round2(this.opfsCloseMs),opfsWriteErrors:this.opfsWriteErrors
    };
  }
}
