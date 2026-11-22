/* ScoreMotion self-contained ZIP (schema_version=1). STORE ZIP entries retain
 * original Blob bytes without buffering full audio in JS. Untrusted ZIP input
 * is checked before reading paths or altering any local project. */
(function(root){
'use strict';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const MAX_ENTRIES=128,MAX_TOTAL=1024*1024*1024,MAX_SINGLE=512*1024*1024;
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotr=(n,r)=>(n>>>r)|(n<<(32-r));
class Sha256 {
  constructor(){this.h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);this.buf=new Uint8Array(64);this.used=0;this.bytes=0;this.words=new Uint32Array(64);}
  block(){const w=this.words,b=this.buf;for(let i=0;i<16;i++){const p=i*4;w[i]=((b[p]<<24)|(b[p+1]<<16)|(b[p+2]<<8)|b[p+3])>>>0;}
    for(let i=16;i<64;i++){const a=w[i-15],c=w[i-2];w[i]=((rotr(c,17)^rotr(c,19)^(c>>>10))+w[i-7]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-16])>>>0;}
    let [a,b1,c,d,e,f,g,h]=this.h;
    for(let i=0;i<64;i++){const t1=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b1)^(a&c)^(b1&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b1;b1=a;a=(t1+t2)>>>0;}
    for(const [i,n] of [a,b1,c,d,e,f,g,h].entries())this.h[i]=(this.h[i]+n)>>>0;
  }
  update(arr){this.bytes+=arr.length;for(let p=0;p<arr.length;){const n=Math.min(64-this.used,arr.length-p);this.buf.set(arr.subarray(p,p+n),this.used);this.used+=n;p+=n;if(this.used===64){this.block();this.used=0;}}return this;}
  hex(){const bits=this.bytes*8;this.buf[this.used++]=128;if(this.used>56){this.buf.fill(0,this.used);this.block();this.used=0;}this.buf.fill(0,this.used,56);const hi=Math.floor(bits/4294967296),lo=bits>>>0;for(let i=0;i<4;i++){this.buf[56+i]=(hi>>>(24-8*i))&255;this.buf[60+i]=(lo>>>(24-8*i))&255;}this.block();return Array.from(this.h,n=>n.toString(16).padStart(8,'0')).join('');}
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes,crc=0xffffffff){for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return crc>>>0;}
async function checksums(blob){if(!(blob instanceof Blob))throw Error('파일 데이터가 없습니다.');const sha=new Sha256();let crc=0xffffffff;for(let off=0;off<blob.size;off+=1024*1024){const bytes=new Uint8Array(await blob.slice(off,Math.min(blob.size,off+1024*1024)).arrayBuffer());sha.update(bytes);crc=crc32(bytes,crc);}return{sha256:sha.hex(),crc32:(crc^0xffffffff)>>>0,byte_size:blob.size};}
function put16(v,o,n){v.setUint16(o,n,true);}function put32(v,o,n){v.setUint32(o,n>>>0,true);}function g16(v,o){return v.getUint16(o,true);}function g32(v,o){return v.getUint32(o,true);}
function safePath(path){return typeof path==='string'&&path.length>0&&path.length<400&&path.split('/').every(s=>s&&s!=='.'&&s!=='..')&&!/[\\\0\r\n]/.test(path)&&!path.startsWith('/')&&!/^[A-Za-z]:/.test(path)&&!/:\/\//.test(path);}
const jsonBlob=value=>new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'});
function validateManifest(m){
  if(!m||m.format!=='scoremotion-project'||!Number.isInteger(m.schema_version))throw Error('ScoreMotion 프로젝트 형식이 아닙니다.');
  if(m.schema_version!==1)throw Error(m.schema_version>1?'이 프로젝트는 최신 ScoreMotion에서 생성됐습니다. 앱을 업데이트하세요.':'지원하지 않는 프로젝트 버전입니다.');
  if(!/^[a-f0-9]{32}$/.test(m.project_id||''))throw Error('프로젝트 ID 형식이 잘못되었습니다.');
  if(typeof m.project_name!=='string'||!m.project_name.trim())throw Error('프로젝트 이름이 없습니다.');
  if(!m.assets||!m.assets.entries||!m.assets.bindings||!m.settings||!m.settings.controls||!m.timeline)throw Error('프로젝트 설정·파일 참조가 누락됐습니다.');
  if(!m.assets.bindings.midi)throw Error('MIDI 원본이 없는 프로젝트입니다.');
  if(Object.keys(m.assets.entries).length>24)throw Error('프로젝트 파일 등록 개수가 너무 많습니다.');
  for(const [id,e] of Object.entries(m.assets.entries)){
    if(!/^[\w-]{1,80}$/.test(id)||!e||!safePath(e.path)||!Number.isSafeInteger(e.byte_size)||e.byte_size<0||e.byte_size>MAX_SINGLE||!/^[a-f0-9]{64}$/.test(e.sha256||''))throw Error('원본 파일 등록 정보가 유효하지 않습니다.');
  }
  for(const [role,id] of Object.entries(m.assets.bindings))if(id!=null&&!m.assets.entries[id])throw Error('파일 연결이 잘못되었습니다: '+role);
  for(const path of Object.values(m.timeline))if(path!=null&&!safePath(path))throw Error('타임라인 파일 경로가 유효하지 않습니다.');
  if(m.analysis?.data_file!=null&&!safePath(m.analysis.data_file))throw Error('분석 파일 경로가 유효하지 않습니다.');
  if(Object.keys(m.settings.controls).length>500)throw Error('설정 개수가 허용 범위를 초과했습니다.');
  for(const v of Object.values(m.settings.controls))if(typeof v!=='string'&&typeof v!=='boolean')throw Error('설정 값의 타입이 유효하지 않습니다.');
  return m;
}
async function build(entries){
  if(!Array.isArray(entries)||!entries.length||entries.length>MAX_ENTRIES)throw Error('ZIP 항목 수가 너무 많습니다.');
  const paths=new Set(),parts=[],central=[];let offset=0,size=0;
  for(const item of entries){
    if(!safePath(item.path)||paths.has(item.path))throw Error('중복되거나 위험한 ZIP 경로입니다: '+item.path);paths.add(item.path);
    const blob=item.blob instanceof Blob?item.blob:jsonBlob(item.json);
    if(blob.size>MAX_SINGLE||(size+=blob.size)>MAX_TOTAL)throw Error('프로젝트 크기 제한을 초과했습니다.');
    const bytes=enc.encode(item.path);if(bytes.length>0xffff)throw Error('파일명이 너무 깁니다.');
    const sum=await checksums(blob),local=new Uint8Array(30+bytes.length),lv=new DataView(local.buffer);
    put32(lv,0,0x04034b50);put16(lv,4,20);put16(lv,6,0x800);put16(lv,8,0);put16(lv,10,0);put16(lv,12,33);put32(lv,14,sum.crc32);put32(lv,18,blob.size);put32(lv,22,blob.size);put16(lv,26,bytes.length);local.set(bytes,30);
    parts.push(local,blob);
    const dir=new Uint8Array(46+bytes.length),dv=new DataView(dir.buffer);put32(dv,0,0x02014b50);put16(dv,4,20);put16(dv,6,20);put16(dv,8,0x800);put16(dv,10,0);put16(dv,12,0);put16(dv,14,33);put32(dv,16,sum.crc32);put32(dv,20,blob.size);put32(dv,24,blob.size);put16(dv,28,bytes.length);put32(dv,42,offset);dir.set(bytes,46);central.push(dir);
    offset+=local.length+blob.size;if(offset>0xffffffff)throw Error('ZIP32 최대 크기를 초과했습니다.');
  }
  const dirSize=central.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),view=new DataView(end.buffer);
  put32(view,0,0x06054b50);put16(view,8,central.length);put16(view,10,central.length);put32(view,12,dirSize);put32(view,16,offset);
  return new Blob([...parts,...central,end],{type:'application/zip'});
}
async function inspect(file){
  if(!(file instanceof Blob)||file.size>MAX_TOTAL+1024*1024||file.size<22)throw Error('프로젝트 ZIP 크기가 유효하지 않습니다.');
  const tailOffset=Math.max(0,file.size-65557),tail=new Uint8Array(await file.slice(tailOffset).arrayBuffer());let eocd=-1;
  for(let i=tail.length-22;i>=0;i--)if(tail[i]===0x50&&tail[i+1]===0x4b&&tail[i+2]===5&&tail[i+3]===6){const v=new DataView(tail.buffer,tail.byteOffset+i);if(i+22+g16(v,20)===tail.length){eocd=i;break;}}
  if(eocd<0)throw Error('ZIP 중앙 디렉터리가 손상되었습니다.');
  const ev=new DataView(tail.buffer,tail.byteOffset+eocd);const n=g16(ev,10),dirSize=g32(ev,12),dirOffset=g32(ev,16);
  if(g16(ev,4)!==0||g16(ev,6)!==0||g16(ev,8)!==n||n>MAX_ENTRIES||!n||dirOffset+dirSize>tailOffset+eocd)throw Error('지원하지 않는 ZIP 형식입니다.');
  const dirBytes=new Uint8Array(await file.slice(dirOffset,dirOffset+dirSize).arrayBuffer());const dir=new DataView(dirBytes.buffer);const records=new Map();let p=0,total=0;
  for(let i=0;i<n;i++){
    if(p+46>dirBytes.length||g32(dir,p)!==0x02014b50)throw Error('ZIP 항목 정보가 손상됐습니다.');
    const flags=g16(dir,p+8),method=g16(dir,p+10),crc=g32(dir,p+16),compressed=g32(dir,p+20),plain=g32(dir,p+24),fl=g16(dir,p+28),extra=g16(dir,p+30),comment=g16(dir,p+32),localOffset=g32(dir,p+42),external=g32(dir,p+38);
    if(flags&1||flags&0x40||![0,8].includes(method)||plain>MAX_SINGLE||(total+=plain)>MAX_TOTAL||compressed>file.size||compressed===0&&plain>0||compressed>0&&plain/compressed>300)throw Error('위험하거나 지원하지 않는 ZIP 압축입니다.');
    const mode=(external>>>16)&0xf000;if(mode===0xa000)throw Error('ZIP 심볼릭 링크는 지원하지 않습니다.');
    if(p+46+fl+extra+comment>dirBytes.length)throw Error('ZIP 파일명이 손상됐습니다.');
    const path=dec.decode(dirBytes.subarray(p+46,p+46+fl));if(!safePath(path)||records.has(path))throw Error('ZIP 내부 경로가 유효하지 않습니다: '+path);
    if(localOffset+30>dirOffset)throw Error('ZIP 로컬 파일 헤더가 잘못됐습니다.');
    const header=new DataView(await file.slice(localOffset,localOffset+30).arrayBuffer());
    if(g32(header,0)!==0x04034b50||g16(header,8)!==method||g16(header,6)!==flags)throw Error('ZIP 로컬 파일 헤더 불일치');
    const localNameLength=g16(header,26),dataStart=localOffset+30+localNameLength+g16(header,28);
    const localName=dec.decode(new Uint8Array(await file.slice(localOffset+30,localOffset+30+localNameLength).arrayBuffer()));
    if(localName!==path)throw Error('ZIP 내부 파일명이 일치하지 않습니다.');
    if(dataStart+compressed>dirOffset)throw Error('ZIP 데이터 경계가 유효하지 않습니다.');
    records.set(path,{path,method,crc,compressed,plain,dataStart});p+=46+fl+extra+comment;
  }
  if(p!==dirBytes.length)throw Error('ZIP 중앙 디렉터리 길이 불일치');
  return {entries:records,async extract(path){const r=records.get(path);if(!r)throw Error('프로젝트에 파일이 없습니다: '+path);
    let blob=file.slice(r.dataStart,r.dataStart+r.compressed);
    if(r.method===8){
      if(typeof DecompressionStream==='undefined')throw Error('압축된 프로젝트를 읽으려면 최신 브라우저가 필요합니다.');
      const reader=blob.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let count=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;
        if(count>r.plain||count>MAX_SINGLE)throw Error('ZIP 압축 해제 크기가 허용값을 초과했습니다.');parts.push(value);}}
      finally{void reader.cancel().catch(()=>{});}
      blob=new Blob(parts);
    }
    if(blob.size!==r.plain)throw Error('ZIP 데이터 크기가 다릅니다: '+path);
    const sum=await checksums(blob);if(sum.crc32!==r.crc)throw Error('ZIP 파일 체크섬이 다릅니다: '+path);return blob;
  },async json(path){const blob=await this.extract(path);if(blob.size>32*1024*1024)throw Error('프로젝트 메타데이터가 너무 큽니다.');return JSON.parse(await blob.text());}};
}
root.ScoreProjectArchive={build,inspect,checksums,validateManifest,jsonBlob,safePath};
})(typeof window!=='undefined'?window:globalThis);
