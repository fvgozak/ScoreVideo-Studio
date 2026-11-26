'use strict';
importScripts('./score-alignment-v2.js?v=sync2','./local-project-codec.js?v=sync2');
self.onmessage=({data})=>{try{self.postMessage({result:self.ScoreLocalCodec.alignScore(data.score,data.timing,data.mode)});}catch(e){self.postMessage({error:String(e?.message||e)});}};
