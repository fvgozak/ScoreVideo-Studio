/**
 * Causal musical activity from note-on timestamps, in song seconds.
 * No note-off, sustain, tempo or velocity influence. All simultaneous note-ons
 * count separately, because the requested metric is note count, not chord rate.
 *
 * Song MIDI note times are sorted at load; an indexed query is O(log N).
 */
function upperBound(sorted, value) {
  let lo=0,hi=sorted.length;
  while (lo<hi) {
    const mid=(lo+hi)>>1;
    if (sorted[mid]<=value) lo=mid+1; else hi=mid;
  }
  return lo;
}

export function createNoteOnIndex(song) {
  return song.events.filter(e=>e.type==='on'&&Number.isFinite(e.time))
    .map(e=>e.time).sort((a,b)=>a-b);
}

/**
 * A trailing window (time-window, time], using a shorter observation period
 * near song start.  The >=2.5s warm-up prevents a single chord at t=0
 * from claiming an implausibly large per-second note rate.
 */
export function noteDensityAt(sortedNoteTimes, time, windowSeconds=10, liveNoteTimes=[]) {
  const width=Math.max(.25, Number(windowSeconds)||10);
  const t=Math.max(0,time);
  const start=t-width;
  const countIn=(arr)=>upperBound(arr,t+1e-8)-upperBound(arr,start+1e-8);
  const count=countIn(sortedNoteTimes)+countIn(liveNoteTimes);
  const observedSeconds=Math.min(width,Math.max(Math.min(width,2.5),t));
  return {count,rate:count/observedSeconds,windowSeconds:width,observedSeconds};
}

/** Rise quickly in a busy passage, but decay gradually when it calms. */
export function smoothFlow(current,target,elapsed,attack=.45,release=2.3){
  if (!(elapsed>0))return current;
  const tau=target>current?Math.max(.01,attack):Math.max(.01,release);
  return current+(target-current)*(-Math.expm1(-elapsed/tau));
}

/** A causal two-window activity estimator. The short window measures
 * local acceleration/deceleration; it is not a look-ahead prediction.
 * effective = longRate + weight * (shortRate - longRate).
 */
export function noteActivityAt(sortedNoteTimes,time,{longWindow=10,shortWindow=2,fastWeight=.35,liveNoteTimes=[]}={}){
  const long=noteDensityAt(sortedNoteTimes,time,longWindow,liveNoteTimes);
  const short=noteDensityAt(sortedNoteTimes,time,shortWindow,liveNoteTimes);
  const weight=Math.max(0,Math.min(1,fastWeight));
  const delta=short.rate-long.rate;
  return {long,short,delta,fastWeight:weight,rate:Math.max(0,long.rate+weight*delta)};
}
