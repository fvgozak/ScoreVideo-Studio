/* Browser MIDI timing parser. Type 0/1, PPQ timeline, note-off, sustain and tempo.
   No MIDI bytes are sent to a server. Reject SMPTE and Type-2 instead of guessing. */
(function(root){
 'use strict';
 function parse(buffer){
   const bytes=new Uint8Array(buffer),view=new DataView(buffer);let offset=0;
   const requireBytes=n=>{if(offset+n>bytes.length)throw Error('손상되거나 잘린 MIDI 파일입니다.');};
   const ascii=n=>{requireBytes(n);let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(bytes[offset++]);return s;};
   const u16=()=>{requireBytes(2);const n=view.getUint16(offset);offset+=2;return n;};
   const u32=()=>{requireBytes(4);const n=view.getUint32(offset);offset+=4;return n;};
   const vlq=end=>{let v=0;for(let k=0;k<4;k++){if(offset>=end)throw Error('잘못된 MIDI 가변 길이 값입니다.');const b=bytes[offset++];v=(v<<7)|(b&127);if(!(b&128))return v;}throw Error('MIDI VLQ 값이 4바이트를 넘습니다.');};
   if(ascii(4)!=='MThd')throw Error('MIDI 헤더(MThd)가 없습니다.');
   const headerLength=u32();if(headerLength<6||headerLength>1024)throw Error('잘못된 MIDI 헤더 길이입니다.');
   const format=u16(),trackCount=u16(),ppq=u16();requireBytes(headerLength-6);offset+=headerLength-6;
   if(format>1)throw Error('Type-2 MIDI는 지원하지 않습니다.');
   if(ppq&0x8000||ppq===0)throw Error('SMPTE 기반 MIDI는 아직 지원하지 않습니다.');
   if(!trackCount||trackCount>1024)throw Error('잘못된 MIDI 트랙 수입니다.');
   const items=[];let order=0,maxTick=0;
   for(let track=0;track<trackCount;track++){
     if(ascii(4)!=='MTrk')throw Error('MIDI 트랙 헤더가 없습니다.');
     const length=u32(),end=offset+length;if(end>bytes.length)throw Error('MIDI 트랙 크기가 실제 파일보다 큽니다.');
     let tick=0,running=0;
     while(offset<end){
       tick+=vlq(end);maxTick=Math.max(maxTick,tick);
       if(offset>=end)throw Error('MIDI 이벤트가 잘렸습니다.');
       let status=bytes[offset];
       if(status&0x80){offset++;if(status<0xf0)running=status;else running=0;}
       else{if(!running)throw Error('MIDI running status 오류입니다.');status=running;}
       if(status===0xff){requireBytes(1);const type=bytes[offset++],size=vlq(end);if(offset+size>end)throw Error('MIDI meta event 오류입니다.');
         if(type===0x51&&size===3){const tempo=(bytes[offset]<<16)|(bytes[offset+1]<<8)|bytes[offset+2];if(tempo>0)items.push({tick,order:order++,type:'tempo',tempo});}
         offset+=size;if(type===0x2f){offset=end;break;}continue;
       }
       if(status===0xf0||status===0xf7){const size=vlq(end);if(offset+size>end)throw Error('MIDI SysEx 오류입니다.');offset+=size;continue;}
       if(status>=0xf0){const size=[0xf1,0xf3].includes(status)?1:status===0xf2?2:0;if(offset+size>end)throw Error('MIDI system 이벤트 오류입니다.');offset+=size;continue;}
       const command=status&0xf0,ch=status&15,size=(command===0xc0||command===0xd0)?1:2;
       if(offset+size>end)throw Error('MIDI channel 이벤트가 잘렸습니다.');
       const a=bytes[offset++],b=size===2?bytes[offset++]:0;
       if(command===0x90&&b>0)items.push({tick,order:order++,type:'on',ch,track,pitch:a,velocity:b});
       else if(command===0x80||(command===0x90&&b===0))items.push({tick,order:order++,type:'off',ch,track,pitch:a});
       else if(command===0xb0&&a===64)items.push({tick,order:order++,type:'pedal',ch,track,value:b});
     }
     offset=end;
   }
   items.sort((a,b)=>a.tick-b.tick||a.order-b.order);
   const round=(n,dec=6)=>+n.toFixed(dec);
   let tick=0,second=0,tempo=500000,first=null,noteCount=0;
   const tempo_map=[{beat:0,second:0,tempo_us:tempo}],note_events=[],pedal_events=[];
   const active=new Map(),pedalDown=new Set(),sustained=new Map();
   const release=(note,sec)=>{note.end_second=round(Math.max(note.second,sec));if(pedalDown.has(note.channel)){
     const queue=sustained.get(note.channel)||[];queue.push(note);sustained.set(note.channel,queue);
   }else note.sustain_end_second=note.end_second;};
   for(const event of items){
     second+=(event.tick-tick)/ppq*tempo/1e6;tick=event.tick;
     const beat=round(tick/ppq),now=round(second);
     if(event.type==='tempo'){
       tempo=event.tempo;const point={beat,second:round(second,9),tempo_us:tempo};
       if(Math.abs(tempo_map.at(-1).beat-beat)<1e-10)tempo_map[tempo_map.length-1]=point;else tempo_map.push(point);
     }else if(event.type==='on'){
       noteCount++;if(first===null)first=tick;
       if(note_events.length<100000){const note={beat,pitch:event.pitch,channel:event.ch,track:event.track,second:now,velocity:event.velocity};
         note_events.push(note);const key=`${event.ch}:${event.pitch}`,queue=active.get(key)||[];queue.push(note);active.set(key,queue);}
     }else if(event.type==='off'){
       const queue=active.get(`${event.ch}:${event.pitch}`);if(queue?.length)release(queue.shift(),second);
     }else if(event.type==='pedal'){
       const down=event.value>=64;
       if(pedal_events.length<100000)pedal_events.push({beat,second:now,channel:event.ch,track:event.track,value:event.value,down});
       if(pedalDown.has(event.ch)&&!down){for(const note of sustained.get(event.ch)||[])note.sustain_end_second=now;sustained.delete(event.ch);}
       if(down)pedalDown.add(event.ch);else pedalDown.delete(event.ch);
     }
   }
   second+=(maxTick-tick)/ppq*tempo/1e6;
   for(const queue of active.values())for(const note of queue){note.end_second=round(second);note.sustain_end_second=note.end_second;}
   for(const queue of sustained.values())for(const note of queue)note.sustain_end_second=round(second);
   if(!noteCount)throw Error('MIDI 파일에 연주 음표가 없습니다.');
   return {ticks_per_beat:ppq,tempo_map,note_count:noteCount,note_events,pedal_events,
     velocity_events_truncated:noteCount>note_events.length,first_note_beat:round(first/ppq),midi_duration_sec:round(second,3)};
 }
 root.ScoreLocalMidi={parse};
})(typeof window!=='undefined'?window:globalThis);
