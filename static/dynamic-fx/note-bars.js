/* Deterministic time-domain note-bar geometry, shared by preview and MP4. */
export const NOTE_BAR_MODES=Object.freeze(['fall','rise','both','off']);
export function normalizeNoteBarMode(mode){
  return NOTE_BAR_MODES.includes(mode)?mode:'fall';
}
/**
 * Rising note: its leading edge starts at the key at note-on. While held,
 * the lower edge remains anchored to the key; on note-off the tail follows
 * the head upward until both edges exit the top of the visible lane.
 * This has no mutable state and is stable across seeking, FPS, or exports.
 */
export function risingNoteRect(note,time,{hitY,roof,speed}){
  const start=Number(note?.start),end=Math.max(start+.08,Number(note?.end));
  const t=Number(time),v=Number(speed);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(t)||
     !(v>0)||!(roof>hitY)||t<start)return null;
  const head=hitY+(t-start)*v;
  const tail=hitY+Math.max(0,t-end)*v;
  const lo=Math.max(hitY+.04,tail);
  const hi=Math.min(roof,head);
  if(!(hi>lo+.018))return null;
  return {lo,hi};
}
