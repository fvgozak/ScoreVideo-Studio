/* Browser-local melody analysis: no network data or DOM transfer. */
'use strict';
importScripts('/static/melody-highlight.js?v=melodyBeta1&accomp1&perceptual1&engines2bcd1');
self.onmessage=({data})=>{
  const notes=Array.isArray(data)?data:data.notes,algorithm=Array.isArray(data)?'v2a':data.algorithm;
  const scores=algorithm==='v2a'?self.ScoreMelodyHighlight.perceptualScores(notes):self.ScoreMelodyHighlight.algorithmScores(notes,algorithm);
  const values=Float32Array.from(notes,n=>scores.get(n)||0);
  self.postMessage({scores:values},[values.buffer]);
};
