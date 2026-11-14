/* Browser-owned MP4 export. The validated frame engine remains shared with the
   isolated experiment; no video frames are sent to the Python server. */
(function(root){
  'use strict';
  let modulePromise=null,cancelled=false,running=false,moduleAttempt=0;
  const modulePaths=['offline.js','offline-audio.js','score-glow-overlay.js','score-static-heads.js','mediabunny.min.mjs'];
  async function moduleFailure(error,requestedPath){
    const failures=[];
    try{
      const response=await fetch(requestedPath,{cache:'no-store'});
      const type=response.headers.get('content-type')||'없음';
      if(!response.ok||!/(javascript|ecmascript)/i.test(type))failures.push(`${requestedPath}: HTTP ${response.status}, Content-Type ${type}`);
      await response.body?.cancel();
    }catch(problem){failures.push(`${requestedPath}: ${problem.message}`);}
    await Promise.all(modulePaths.map(async name=>{
      const path=`/static/offline/${name}`;
      try{
        const response=await fetch(path,{method:'HEAD',cache:'no-store'});
        const type=response.headers.get('content-type')||'없음';
        if(!response.ok||!/(javascript|ecmascript)/i.test(type))failures.push(`${path}: HTTP ${response.status}, Content-Type ${type}`);
      }catch(problem){failures.push(`${path}: ${problem.message}`);}
    }));
    return Error(`고속 엔진 모듈 로딩 실패${failures.length?` (${failures.join('; ')})`:''}: ${error.message}`);
  }

  async function probe(width=1280,height=720,fps=30){
    if(!root.isSecureContext)return {supported:false,reason:'보안 컨텍스트(로컬호스트 또는 HTTPS)가 필요합니다.'};
    if(!root.VideoEncoder||!root.AudioEncoder)return {supported:false,reason:'WebCodecs H.264/AAC 인코더를 지원하지 않습니다.'};
    if(!root.AudioContext||!root.createImageBitmap||!document.createElement('canvas').getContext('2d'))
      return {supported:false,reason:'오디오 디코딩 또는 Canvas 합성을 지원하지 않습니다.'};
    if(!navigator.storage?.getDirectory)return {supported:false,reason:'장시간 MP4를 저장할 OPFS를 지원하지 않습니다.'};
    try{
      const [video,audio]=await Promise.all([
        VideoEncoder.isConfigSupported({codec:'avc1.420028',width,height,framerate:fps,bitrate:8_000_000}),
        AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000})
      ]);
      if(!video.supported||!audio.supported)return {supported:false,reason:'이 해상도에서 H.264 또는 AAC 인코더를 사용할 수 없습니다.'};
      const directory=await navigator.storage.getDirectory();
      if(!directory)return {supported:false,reason:'OPFS 저장 공간에 접근할 수 없습니다.'};
      await engine();
      return {supported:true,reason:'WebCodecs H.264/AAC · OPFS 사용 가능'};
    }catch(error){return {supported:false,reason:`인코더 확인 실패: ${error.message}`};}
  }

  async function engine(){
    if(!modulePromise){
      const path=`/static/offline/offline.js?v=2${moduleAttempt?`&retry=${moduleAttempt}`:''}`;
      modulePromise=import(path).catch(async error=>{modulePromise=null;moduleAttempt++;throw await moduleFailure(error,path);});
    }
    await modulePromise;
    if(!root.ScoreOfflinePrototype)throw Error('오프라인 MP4 모듈을 불러오지 못했습니다.');
    return root.ScoreOfflinePrototype;
  }

  async function run({fps,onProgress=()=>{}}){
    if(running)throw Error('다른 오프라인 MP4 출력이 진행 중입니다.');
    running=true;cancelled=false;
    const timer=setInterval(()=>{if(root.__offlineProgress)onProgress(root.__offlineProgress);},250);
    try{
      const api=await engine();
      if(cancelled)throw Error('Cancelled');
      const metrics=await api.run('full',{fps,fullSong:true,audioMode:'source',storage:'opfs',
        pianoMode:'shadow-sprite',scoreGlow:true});
      if(cancelled){await api.release();throw Error('Cancelled');}
      const file=root.__offlineResult;
      if(!(file instanceof Blob)||file.size<4096){await api.release();throw Error('완성된 MP4 파일이 유효하지 않습니다.');}
      return {file,metrics};
    }finally{clearInterval(timer);running=false;}
  }

  root.ScoreOfflineExport={probe,run,
    cancel(){cancelled=true;root.ScoreOfflinePrototype?.cancel();},
    release(){return root.ScoreOfflinePrototype?.release()||Promise.resolve();},
    get running(){return running;}
  };
})(window);
