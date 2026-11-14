/* Engraving split: cache the staff separately from noteheads. */
const svgNamespace='http://www.w3.org/2000/svg';
const imageFromSvg=async svg=>{
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}));
  try{const image=new Image();image.src=url;await image.decode();return image;}
  finally{URL.revokeObjectURL(url);}
};
const position=(rect,origin,sx,sy)=>[(rect.left-origin.left)*sx,(rect.top-origin.top)*sy,rect.width*sx,rect.height*sy];

export async function createStaticScoreHeads(stage,canvas){
  const css=(await fetch('/static/stage.css').then(response=>response.text()))
    .replaceAll('.score-window[data-notation-style=','svg[data-notation-style=');
  const entries=new Map(),scratch=document.createElement('canvas'),brush=scratch.getContext('2d');
  const output=canvas.getContext('2d');
  let rasterMs=0,drawMs=0,removedHeads=0,frames=0;
  const prepare=async svg=>{
    const method=svg.cloneNode,original=method.bind(svg),copy=original(true);
    copy.setAttribute('xmlns',svgNamespace);
    copy.setAttribute('data-notation-style',stage.settings.scene.notationStyle);
    copy.querySelectorAll('.score-glowing,.score-note-moving,.score-minimal-active').forEach(node=>{
      node.classList.remove('score-glowing','score-note-moving','score-minimal-active');
      node.style.removeProperty('translate');node.style.removeProperty('scale');
      node.style.removeProperty('--score-minimal-color');
    });
    copy.querySelectorAll('path,rect,line,ellipse,circle,polygon,polyline,text,use,image').forEach(node=>{
      if(!node.closest('.vf-notehead,defs,clipPath,mask'))node.remove();
    });
    const style=document.createElementNS(svgNamespace,'style');style.textContent=css;
    copy.insertBefore(style,copy.firstChild);
    const started=performance.now(),image=await imageFromSvg(copy);
    rasterMs+=performance.now()-started;
    const hadOwn=Object.hasOwn(svg,'cloneNode');
    svg.cloneNode=function(deep){
      const clone=original(deep);
      if(deep)clone.querySelectorAll('.vf-notehead').forEach(head=>head.remove());
      return clone;
    };
    entries.set(svg,{image,hadOwn,method});
  };
  const restore=()=>{
    for(const [svg,{hadOwn,method}] of entries){
      if(hadOwn)svg.cloneNode=method;else delete svg.cloneNode;
    }
    entries.clear();scratch.width=0;scratch.height=0;
  };
  try{for(const svg of stage.scoreWindow.querySelectorAll('svg'))await prepare(svg);}
  catch(error){restore();throw error;}
  function eraseRestingHead(head,motionEl,sx,sy,region){
    const translate=motionEl.style.getPropertyValue('translate');
    const scale=motionEl.style.getPropertyValue('scale');
    motionEl.style.removeProperty('translate');motionEl.style.removeProperty('scale');
    try{
      for(const path of head.querySelectorAll('path[d]')){
        const matrix=path.getScreenCTM();if(!matrix)continue;
        brush.save();brush.globalCompositeOperation='destination-out';
        brush.setTransform(matrix.a*sx,matrix.b*sy,matrix.c*sx,matrix.d*sy,
          (matrix.e-region.left)*sx,(matrix.f-region.top)*sy);
        const glyph=new Path2D(path.getAttribute('d'));
        brush.fill(glyph);
        // The note-only layer has no staff/stems, so the small edge allowance
        // cannot erase those symbols but removes the original antialiased rim.
        brush.lineWidth=Math.max(.35,parseFloat(getComputedStyle(path).strokeWidth)||0);
        brush.stroke(glyph);
        brush.restore();
      }
      removedHeads++;
    }finally{
      if(translate)motionEl.style.setProperty('translate',translate);
      if(scale)motionEl.style.setProperty('scale',scale);
    }
  }
  return {
    draw(){
      if(!stage.settings.scoreVisible||stage.meta.has_score===false)return;
      const started=performance.now(),base=stage.viewport.getBoundingClientRect(),region=stage.scoreWindow.getBoundingClientRect();
      if(!base.width||!region.width||!region.height)return;
      const sx=stage.settings.width/base.width,sy=stage.settings.height/base.height;
      const width=Math.ceil(region.width*sx),height=Math.ceil(region.height*sy);
      if(scratch.width!==width||scratch.height!==height){scratch.width=width;scratch.height=height;}
      brush.clearRect(0,0,width,height);
      for(const [svg,{image}] of entries){
        const rect=svg.getBoundingClientRect();
        if(rect.bottom<=region.top||rect.top>=region.bottom||rect.right<=region.left||rect.left>=region.right)continue;
        brush.drawImage(image,...position(rect,region,sx,sy));
      }
      const seen=new Set();
      for(const {el,motionEl=el} of stage.follower.activeNodes){
        if(seen.has(el)||!motionEl.classList.contains('score-note-moving'))continue;
        seen.add(el);
        if(!entries.has(el.ownerSVGElement))continue;
        eraseRestingHead(el,motionEl,sx,sy,region);
      }
      output.drawImage(scratch,(region.left-base.left)*sx,(region.top-base.top)*sy);
      drawMs+=performance.now()-started;frames++;
    },
    stats(){return {rasterMs:+rasterMs.toFixed(2),drawMs:+drawMs.toFixed(2),frames,removedHeads,
      images:entries.size,imagePixelBytes:[...entries.values()].reduce((sum,{image})=>sum+image.width*image.height*4,0),
      scratchPixelBytes:scratch.width*scratch.height*4};},
    close:restore
  };
}
