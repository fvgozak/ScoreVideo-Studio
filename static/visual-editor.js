/* ScoreVideo Studio v0.16 — direct manipulation of score-region geometry.
 * Editor-only: this file is NOT imported on the MP4 render page.
 * Export and preview both use the same score_area_* settings.
 */
(function (root) {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const num=(v, fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
  function readValues(controls){
    return {x:num(controls.x.value,50),width:num(controls.width.value,94),
      height:num(controls.height.value,70),top:num(controls.top.value,4),
      bottom:num(controls.bottom.value,9)};
  }
  function geometry(v,w,h){
    w=Math.max(1,w);h=Math.max(1,h);
    const pw=clamp(num(v.width,94),30,100), ph=clamp(num(v.height,70),15,100);
    const x=clamp(num(v.x,50),0,100),t=clamp(num(v.top,4),0,45),b=clamp(num(v.bottom,9),0,45);
    const width=w*pw/100, top=h*t/100, bottom=h*b/100;
    const height=Math.max(1,Math.min(h*ph/100,h-top-bottom));
    return {left:(w-width)*x/100,top,width,height,bottom};
  }
  function move(values,mode,dx,dy,w,h){
    const v={...values}; const r=geometry(values,w,h);
    if(mode==='move'){
      const left=clamp(r.left+dx,0,Math.max(0,w-r.width));
      const maxTop=Math.max(0,Math.min(h*.45,h-r.height));
      const top=clamp(r.top+dy,0,maxTop);
      v.x=w-r.width>0?(left/(w-r.width))*100:50;
      v.top=top/h*100;
      // The bottom clearance is what remains below the selected box.
      v.bottom=clamp((h-top-r.height)/h*100,0,45);
      v.height=r.height/h*100;
    } else {
      if(mode==='right'||mode==='corner'){
        const newW=clamp(r.width+dx,w*.30,w-r.left);
        v.width=newW/w*100;
        v.x=w-newW>0?r.left/(w-newW)*100:50;
      }
      if(mode==='bottom'||mode==='corner'){
        const maxH=Math.max(h*.15,h-r.top);
        const newH=clamp(r.height+dy,h*.15,maxH);
        v.height=newH/h*100;
        v.bottom=clamp((h-r.top-newH)/h*100,0,45);
      }
    }
    return {
      x:clamp(Math.round(v.x),0,100),width:clamp(Math.round(v.width),30,100),
      height:clamp(Math.round(v.height),15,100),top:clamp(Math.round(v.top),0,45),
      bottom:clamp(Math.round(v.bottom),0,45),
    };
  }
  function initTabs(){
    const buttons=Array.from(document.querySelectorAll('[data-editor-tab]'));
    const panels=Array.from(document.querySelectorAll('[data-editor-panel]'));
    function selectTab(key){
      for(const b of buttons){const active=b.dataset.editorTab===key;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
      for(const p of panels)p.hidden=p.dataset.editorPanel!==key;
    }
    for(const b of buttons)b.addEventListener('click',()=>{if(!b.disabled)selectTab(b.dataset.editorTab);});
    selectTab('project');
    return selectTab;
  }
  function createScoreVisualEditor({frame,overlay,box,editButton,centerButton,controls,getResolution,getStage,commit,label}){
    const selectTab=initTabs();
    let active=false,dragging=null;
    const sizeLabel=document.getElementById('scoreEditSize');
    function sync(){
      if(!frame||!box)return;
      const {width,height}=getResolution();
      const g=geometry(readValues(controls),width,height);
      box.style.left=(g.left/width*100)+'%';
      box.style.top=(g.top/height*100)+'%';
      box.style.width=(g.width/width*100)+'%';
      box.style.height=(g.height/height*100)+'%';
      if(sizeLabel)sizeLabel.textContent=`${Math.round(g.width/width*100)}% × ${Math.round(g.height/height*100)}%`;
      return g;
    }
    function setEditing(next){
      active=Boolean(next)&&!editButton.disabled;
      overlay.hidden=!active;
      editButton.setAttribute('aria-pressed',String(active));
      editButton.textContent=active?'✓ 영역 편집 완료':'▢ 악보 영역 편집';
      centerButton.hidden=!active;
      sync();
    }
    function activate(){selectTab('score');setEditing(true);}
    editButton.addEventListener('click',()=>setEditing(!active));
    centerButton.addEventListener('click',()=>{controls.x.value='50';label();sync();commit();});
    box.addEventListener('pointerdown',e=>{
      if(e.button!==0||!active)return;
      e.preventDefault();
      const handle=e.target.closest('[data-resize]');
      const mode=handle?handle.dataset.resize:'move';
      dragging={id:e.pointerId,mode,clientX:e.clientX,clientY:e.clientY,start:readValues(controls),stageSize:getResolution(),frameRect:frame.getBoundingClientRect()};
      box.setPointerCapture?.(e.pointerId);
    });
    box.addEventListener('pointermove',e=>{
      if(!dragging||e.pointerId!==dragging.id)return;
      e.preventDefault();
      const d=dragging;
      const dx=(e.clientX-d.clientX)*d.stageSize.width/Math.max(1,d.frameRect.width);
      const dy=(e.clientY-d.clientY)*d.stageSize.height/Math.max(1,d.frameRect.height);
      const next=move(d.start,d.mode,dx,dy,d.stageSize.width,d.stageSize.height);
      for(const [key,c] of Object.entries(controls))c.value=String(next[key]);
      label();
      const g=sync();
      // Immediate WYSIWYG while dragging; expensive OSMD re-layout only on release.
      const stage=getStage();
      if(stage?.scoreWindow&&g){
        Object.assign(stage.scoreWindow.style,{left:`${g.left}px`,top:`${g.top}px`,width:`${g.width}px`,height:`${g.height}px`});
      }
    });
    function finish(e){
      if(!dragging||e.pointerId!==dragging.id)return;
      dragging=null;
      try{if(box.hasPointerCapture?.(e.pointerId))box.releasePointerCapture(e.pointerId);}catch(_){ }
      commit();
    }
    box.addEventListener('pointerup',finish);
    box.addEventListener('pointercancel',finish);
    return {sync,activate,setEditing,read:()=>readValues(controls),selectTab};
  }
  root.ScoreVisualGeometry={geometry,move};
  root.createScoreVisualEditor=createScoreVisualEditor;
})(typeof window==='undefined'?globalThis:window);
