/* Bounded overlap between GPU composition and MP4 encoding.
 * CanvasSource.add() constructs its VideoSample (and snapshots the canvas) before
 * returning its promise. Always invoke add() synchronously, before the next
 * composition overwrites the canvas. Do not queue closures that read the canvas.
 */
export class VideoEncodeQueue {
  constructor(source,{maxInFlight=2,onComplete=()=>{},onSubmit=()=>{},now=()=>performance.now()}={}) {
    if(!source||typeof source.add!=='function')throw new TypeError('Video source must implement add().');
    if(!Number.isInteger(maxInFlight)||maxInFlight<1||maxInFlight>3)
      throw new RangeError('maxInFlight must be between 1 and 3.');
    this.source=source;this.maxInFlight=maxInFlight;this.onComplete=onComplete;this.onSubmit=onSubmit;this.now=now;
    this.pending=[];this.submitted=0;this.inFlight=0;this.peakInFlight=0;
  }

  async add(timestamp,duration,frameIndex){
    const waitingSince=this.now();
    if(this.pending.length>=this.maxInFlight)await this._drainOne();
    const blockedMs=this.now()-waitingSince;
    const started=this.now();
    // The CanvasSource frame capture MUST happen here, before yielding control.
    // Normalizing rejected promises prevents unhandled rejections while a
    // later frame is being composed.
    let operation;
    try{operation=Promise.resolve(this.source.add(timestamp,duration));}
    catch(error){operation=Promise.reject(error);}
    this.onSubmit(frameIndex,this.now()-started);
    this.submitted++;this.inFlight++;
    this.peakInFlight=Math.max(this.peakInFlight,this.inFlight);
    const tracked=operation.then(
      ()=>({ok:true}),error=>({ok:false,error})
    ).then(result=>{
      this.inFlight--;
      this.onComplete(frameIndex,this.now()-started,result.ok);
      return result;
    });
    this.pending.push(tracked);
    // Initialize the H.264 encoder and MP4 track before overlapping frames.
    // Avoids concurrent first-use WebCodecs initialization and keyframe races.
    if(this.submitted===1)await this._drainOne();
    return blockedMs;
  }

  async _drainOne(){
    const result=await this.pending.shift();
    if(result&&!result.ok)throw result.error;
  }

  async drain(){while(this.pending.length)await this._drainOne();}

  async settle(){
    // Used on cancellation/error before output.cancel(): let the tiny, bounded
    // pending queue settle without masking the original failure.
    await Promise.all(this.pending.splice(0));
  }
}
