/* ScoreMotion Score Editor V1.3.1 — visual-only notation and part label overrides. */
(function(root){'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
 const clean=s=>String(s??'').trim().replace(/\s+/g,' ');
 const defaults=()=>({version:1,source:'',edits:{}});
 const base=()=>({x:0,y:0,scale:1,hidden:false});
 const fonts={serif:'Georgia, serif',sans:'Arial, sans-serif',mono:'monospace'};
 const textAttrs=['font-family','font-weight','font-style'];
 function stylePatch(e){const n={};if(typeof e.text==='string'&&e.text.length<=240&&clean(e.text))n.text=clean(e.text);if(Object.hasOwn(fonts,e.font))n.font=e.font;if(['normal','bold'].includes(e.weight))n.weight=e.weight;if(['normal','italic'].includes(e.italic))n.italic=e.italic;return n;}
 function normalize(v){const out=defaults();if(v?.version!==1||typeof v.source!=='string'||!/^\d+:[0-9a-f]{8}:[0-9a-f]{8}$/.test(v.source))return out;out.source=v.source;
   for(const [id,e] of Object.entries(v.edits||{}).slice(0,2000)){if(!/^(?:[dimp]:\d+:\d+:\d+:\d+|f:\d+:\d+:\d+:\d+:\d+)$/.test(id)||!e||typeof e!=='object')continue;
     const n={x:clamp(num(e.x,0),-2000,2000),y:clamp(num(e.y,0),-2000,2000),scale:clamp(num(e.scale,1),.5,2),hidden:e.hidden===true};
     Object.assign(n,stylePatch(e));if(n.x||n.y||n.scale!==1||n.hidden||Object.keys(n).length>4)out.edits[id]=n; }return out;}
 function fingerprint(xml){let a=2166136261,b=0x9e3779b9;for(let i=0;i<xml.length;i++){const c=xml.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);}return `${xml.length}:${(a>>>0).toString(16).padStart(8,'0')}:${(b>>>0).toString(16).padStart(8,'0')}`;}
 function catalog(xml){const doc=new DOMParser().parseFromString(xml,'application/xml'),out=[];
   if(doc.querySelector('parsererror')||doc.documentElement.localName!=='score-partwise')return out;
   const children=(n,name)=>[...n.children].filter(e=>e.localName===name);
   children(doc.documentElement,'part').forEach((p,pi)=>children(p,'measure').forEach((m,mi)=>children(m,'direction').forEach((d,di)=>{
     const entries=children(d,'direction-type').flatMap(n=>[...n.children]);
     entries.forEach((e,ei)=>{let kind=e.localName,label='';if(kind==='words')label=clean(e.textContent);else if(kind==='metronome'){kind='tempo';label=clean(children(e,'per-minute')[0]?.textContent);}else if(kind==='dynamics'){kind='dynamic';label=[...e.children].map(n=>n.localName==='other-dynamics'?clean(n.textContent):n.localName).join('');}else return;
       if(label)out.push({id:`d:${pi}:${mi}:${di}:${ei}`,kind,label,partId:p.getAttribute('id'),measureIndex:mi,measure:m.getAttribute('number')||String(mi+1),staff:clean(children(d,'staff')[0]?.textContent)||'1'});});})));return out;}
 // The pedal renderer creates path elements, not GraphicalLabel.SVGNode.
 // Capture the actual SVG group at the point where OSMD draws each marking.
 const pedalNodes=new WeakMap();
 function instrumentDrawer(drawer){if(typeof drawer?.drawPedals!=='function')return;
   const original=drawer.drawPedals;
   drawer.drawPedals=function(sl){const restore=[];try{
     for(const pedal of sl.Pedals||[]){if(!pedal||typeof pedal.getPedalMarking!=='function')continue;
       const own=Object.getOwnPropertyDescriptor(pedal,'getPedalMarking'),get=pedal.getPedalMarking;
       pedal.getPedalMarking=function(...args){const marking=get.apply(this,args),draw=marking?.draw;
         if(typeof draw!=='function')return marking;
         marking.draw=function(...args){const ctx=drawer.backend?.getContext?.();if(!ctx?.openGroup||!ctx?.closeGroup)return draw.apply(this,args);
           const group=ctx.openGroup('score-editor-pedal');try{return draw.apply(this,args);}finally{ctx.closeGroup();if(group?.namespaceURI==='http://www.w3.org/2000/svg'&&group.childNodes.length)pedalNodes.set(pedal,group);}};
         return marking;};
       restore.push(()=>{if(own)Object.defineProperty(pedal,'getPedalMarking',own);else delete pedal.getPedalMarking;});
     }return original.call(this,sl);
   }finally{for(const f of restore)f();}};
 }
 function render(osmd){const descriptor=Object.getOwnPropertyDescriptor(osmd,'drawer');
   // Bundled OSMD creates its drawer inside render(). Preserve the property and
   // install a wrapper only on that newly-created drawer; no prototype changes.
   if(descriptor&&(!descriptor.configurable||!('value' in descriptor)||!descriptor.writable))return osmd.render();
   let drawer=osmd.drawer;Object.defineProperty(osmd,'drawer',{configurable:true,enumerable:descriptor?.enumerable??true,get(){return drawer;},set(v){drawer=v;instrumentDrawer(v);}});
   try{return osmd.render();}finally{Object.defineProperty(osmd,'drawer',{configurable:descriptor?.configurable??true,enumerable:descriptor?.enumerable??true,writable:descriptor?.writable??true,value:drawer});}
 }
 const textEditable=item=>item?.kind==='words'||item?.kind==='instrument'||item?.kind==='abbreviation';
 function match(container,xml,zoom,osmd){if(typeof xml!=='string'||!xml.trimStart().startsWith('<'))return null;const source=fingerprint(xml),spec=catalog(xml),groups=[];
   // OSMD GraphicalLabel.SVGNode is an exact reference to the rendered group.
   // SourceMeasure identity and staff identity disambiguate repeated words/dynamics.
   // No DOM ordering or guessed nearest note matching.
   const claimed=new Set(),known=new Set();
   const graph=osmd?.GraphicSheet||osmd?.graphic,sourceMeasures=osmd?.Sheet?.SourceMeasures||[];
   const staffLines=new Set((graph?.MeasureList||[]).flatMap(row=>row.filter(Boolean).map(m=>m.parentStaffLine)).filter(Boolean));
   for(const sl of staffLines){const staff=sl.parentStaff,inst=staff?.parentInstrument,staffNo=(inst?.Staves||[]).indexOf(staff)+1;
     if(!inst?.idString||staffNo<1)continue;
     for(const expr of sl.abstractExpressions||[]){const el=expr.label?.SVGNode;if(!el||!container.contains(el)||!el.matches('g.vf-text'))continue;
       known.add(el);const texts=[...el.querySelectorAll('text')];if(texts.length!==1)continue;
       const mi=sourceMeasures.indexOf(expr.parentMeasure||expr.sourceMultiExpression?.sourceMeasure);if(mi<0)continue;
       const label=clean(texts[0].textContent);const kind=expr.mInstantaneousDynamicExpression?'dynamic':expr.sourceMultiExpression?'words':null;if(!kind)continue;
       const candidates=spec.filter(s=>s.kind===kind&&s.label===label&&s.partId===inst.idString&&s.measureIndex===mi&&Number(s.staff)===staffNo);
       if(candidates.length===1){groups.push({el,text:texts[0],spec:candidates[0]});claimed.add(el);}
     }
   }
   // Resolve additional glyphs from the OSMD graph, never by global text search.
   const xmlDoc=new DOMParser().parseFromString(xml,'application/xml');
   const parts=[...xmlDoc.documentElement.children].filter(e=>e.localName==='part');
   const systems=[...new Set((graph?.MusicPages||[]).flatMap(p=>p.MusicSystems||[]))];
   const addLabel=(label,spec)=>{const el=label?.SVGNode;if(!el||!container.contains(el)||claimed.has(el))return;
     known.add(el);const texts=[...el.querySelectorAll('text')];if(texts.length!==1)return;
     groups.push({el,text:texts[0],spec});claimed.add(el);};
   for(const [si,sys] of systems.entries()){
     const lines=sys.StaffLines||sys.staffLines||[],first=lines[0],measures=first?.Measures||[];
     const instruments=new Set(lines.map(sl=>sl.parentStaff?.parentInstrument).filter(Boolean));
     for(const inst of instruments){const pi=parts.findIndex(p=>p.getAttribute('id')===inst.idString);if(pi<0)continue;
       const label=sys.labels?.getValue?.(inst),text=clean(label?.Label?.text);if(!text)continue;
       // OSMD creates full labels on the first system, abbreviations on later ones.
       // All displayed abbreviations for a part share one stable edit ID.
       const kind=si===0?'instrument':'abbreviation',expected=clean(si===0?inst.Name:inst.PartAbbreviation);
       if(!expected||text!==expected)continue;
       addLabel(label,{id:`i:${pi}:${si===0?0:1}:0:0`,kind,label:text,partId:inst.idString,measure:si===0?'1':'*',staff:'—'});
     }
     for(const label of sys.MeasureNumberLabels||sys.measureNumberLabels||[]){const el=label?.SVGNode;if(el)known.add(el);
       const text=clean(label?.Label?.text),candidates=measures.filter(m=>String(m.parentSourceMeasure?.getPrintedMeasureNumber?.())===text);
       if(candidates.length!==1)continue;const mi=sourceMeasures.indexOf(candidates[0].parentSourceMeasure);if(mi<0)continue;
       addLabel(label,{id:`m:${mi}:0:0:0`,kind:'measure',label:text,partId:'—',measure:text,staff:'—'});
     }
   }
   for(const sl of staffLines){const staff=sl.parentStaff,inst=staff?.parentInstrument,staffNo=(inst?.Staves||[]).indexOf(staff)+1;
     if(!inst?.idString||staffNo<1)continue;
     for(const m of sl.Measures||[]){const mi=sourceMeasures.indexOf(m.parentSourceMeasure);if(mi<0)continue;
       const containers=m.parentSourceMeasure.verticalSourceStaffEntryContainers||[];
       for(const entry of m.staffEntries||[]){for(const label of entry.FingeringEntries||[]){const el=label?.SVGNode;if(el)known.add(el);
         const note=label?.sourceNote,ss=note?.parentStaffEntry,voice=note?.voiceEntry,ci=containers.findIndex(c=>c.StaffEntries?.includes(ss)),gi=ci<0?-1:containers[ci].StaffEntries.indexOf(ss),vi=(ss?.voiceEntries||[]).indexOf(voice),ni=(voice?.Notes||voice?.notes||[]).indexOf(note);
         if([ci,gi,vi,ni].some(i=>i<0)||ss?.parentStaff!==staff)continue;
         const text=clean(label.Label?.text);if(!text)continue;
         addLabel(label,{id:`f:${mi}:${gi}:${ci}:${vi}:${ni}`,kind:'fingering',label:text,partId:inst.idString,measure:String(m.parentSourceMeasure.getPrintedMeasureNumber()),staff:String(staffNo)});
       }}
     }
     for(const pedal of sl.Pedals||[]){const el=pedalNodes.get(pedal);if(!el||!container.contains(el)||claimed.has(el))continue;
       const expr=pedal.getPedal?.ParentStartMultiExpression,mi=sourceMeasures.indexOf(expr?.sourceMeasure||expr?.SourceMeasure),rows=sourceMeasures[mi]?.staffLinkedExpressions||[],gi=rows.findIndex(row=>row?.includes(expr)),ei=gi<0?-1:rows[gi].indexOf(expr);
       if(mi<0||gi<0||ei<0||expr.PedalStart!==pedal.getPedal)continue;
       groups.push({el,text:null,spec:{id:`p:${mi}:${gi}:${ei}:0`,kind:'pedal',label:'Ped. / *',partId:inst.idString,measure:String(sourceMeasures[mi].getPrintedMeasureNumber()),staff:String(staffNo)}});claimed.add(el);
     }
   }
   for(const el of container.querySelectorAll('svg g.vf-stavetempo,svg g.vf-text:not(.measure-number)')){
     if(claimed.has(el)||known.has(el))continue;
     // Legacy fallback for unique labels; on real OSMD avoid page titles / instrument labels.
     if(osmd&&!el.closest('.staffline'))continue;
     const texts=[...el.querySelectorAll('text')];if(texts.length!==1)continue;const label=clean(texts[0].textContent);if(!label)continue;
     const tempo=el.classList.contains('vf-stavetempo');const key=tempo?label.replace(/^=\s*/,''):label;
     const candidates=spec.filter(s=>s.label===key&&(tempo?s.kind==='tempo':s.kind!=='tempo'));
     if(candidates.length===1)groups.push({el,text:texts[0],spec:candidates[0]}); }
   const counts=new Map();for(const g of groups)counts.set(g.spec.id,(counts.get(g.spec.id)||0)+1);
   const items=new Map();for(const g of groups){const shared=g.spec.kind==='instrument'||g.spec.kind==='abbreviation';if(!shared&&counts.get(g.spec.id)!==1)continue;let bbox;try{bbox=g.el.getBBox();}catch(_){continue;}if(!bbox.width||!bbox.height)continue;
     const item={...g,...g.spec,original:g.el.getAttribute('transform'),display:g.el.style.display,originalText:g.text?.textContent??'',originalAttrs:Object.fromEntries(textAttrs.map(a=>[a,g.text?.getAttribute(a)])),styleKey:'{}',bbox:{x:bbox.x,y:bbox.y,width:bbox.width,height:bbox.height},replicas:[]};const existing=items.get(g.spec.id);if(existing)existing.replicas.push(item);else items.set(g.spec.id,item);}
   return {source,items,zoom:Math.max(.01,zoom||1),container};}
 function applyItem(reg,item,e){for(const node of [item,...(item.replicas||[])])applyNode(reg,node,e);}
 function applyNode(reg,item,e){e=e||base();
   // Only words and part labels are editable as text. Music glyphs stay intact.
   if(textEditable(item)){const style=stylePatch(e),key=JSON.stringify(style);if(item.styleKey!==key){
     item.text.textContent=style.text??item.originalText;
     const attrs={'font-family':fonts[style.font],'font-weight':style.weight,'font-style':style.italic};
     for(const a of textAttrs){const v=attrs[a]??item.originalAttrs[a];if(v==null)item.text.removeAttribute(a);else item.text.setAttribute(a,v);}
     item.el.style.display=item.display;try{const b=item.el.getBBox();if(b.width&&b.height)item.bbox={x:b.x,y:b.y,width:b.width,height:b.height};}catch(_){}item.styleKey=key;
   }}
   const b=item.bbox,x=b.x+b.width/2,y=b.y+b.height/2,z=reg.zoom;
   if(e.x||e.y||e.scale!==1){const m=`translate(${e.x*z} ${e.y*z}) ${item.original||''} translate(${x} ${y}) scale(${e.scale}) translate(${-x} ${-y})`;
     item.el.setAttribute('transform',m);}
   else if(item.original===null)item.el.removeAttribute('transform');else item.el.setAttribute('transform',item.original);
   item.el.style.display=e.hidden?'none':item.display;
 }
 function apply(reg,v){if(!reg)return;const state=normalize(v),edits=state.source===reg.source?state.edits:{};for(const item of reg.items.values())applyItem(reg,item,edits[item.id]);}
 // SCORE_EDITOR_EXPORT_PARITY_V1: preserve legacy edit units and preview appearance.
 // OSMD's SVG viewBox already scales by the physical engraving zoom. Multiplying
 // stored translations by export layoutScale as well moves them twice. Keep
 // reg.zoom at the user's logical zoom for apply, drag, align and overflow.
 function attach(follower,xml){const logicalZoom=follower.effects?.scoreEditorZoom;
   const editZoom=Number.isFinite(logicalZoom)&&logicalZoom>0?logicalZoom:follower.zoom;
   const reg=match(follower.container,xml,editZoom,follower.osmd);follower.scoreEditorRegistry=reg;apply(reg,follower.effects.scoreEdits);return reg;}
 // Work in CSS screen pixels for snap tolerance, then convert back to unzoomed SVG coordinates.
 function snap(value,anchors,tolerance=8){let result=null;for(const a of anchors){const delta=a-value;if(Math.abs(delta)<=tolerance&&(!result||Math.abs(delta)<Math.abs(result.delta)))result={delta,target:a};}return result;}
 function overflow(bounds,region,eps=1){return {top:bounds.some(b=>b.top<region.top-eps),bottom:bounds.some(b=>b.bottom>region.bottom+eps)};}
 let state=defaults(),stage=null,active=false,magnet=true,selected='',selection=new Set(),drag=null,undo=[],redo=[],overlay=null,raf=0,dirtyBounds=true,bounds=[],opts={},suspended=false;
 const $=id=>document.getElementById(id),reg=()=>stage?.follower?.scoreEditorRegistry,copy=v=>JSON.parse(JSON.stringify(v));
 const tr=k=>root.ScoreI18n?.t('scoreEditor.'+k)||k;
 const kinds=['words','tempo','dynamic','instrument','abbreviation','measure','fingering','pedal'];
 let filter='all',hoverEvent=null,hoverRaf=0,hitCache=null,listPage=0,listKey='',menuOpen=false;
 const kindMatches=i=>filter==='all'||i.kind===filter;
 const labelFor=i=>stateFor(reg())[i.id]?.text??i.label;
 const itemLabel=i=>`${i.measure} · ${i.partId||'—'}/${i.staff} · ${tr('kind_'+i.kind)} · ${labelFor(i)}`;
 function closeMenu(){menuOpen=false;const m=$('scoreEditorContext');if(m)m.hidden=true;}
 function clearHover(){hoverEvent=null;if(hoverRaf){cancelAnimationFrame(hoverRaf);hoverRaf=0;}const h=$('scoreEditorHover');if(h)h.hidden=true;if(overlay)overlay.style.cursor='';}
 function areaBox(){const a=screenBox(stage.scoreWindow);a.top+=(a.bottom-a.top)*(stage.settings.scoreRegion.cropTopPercent||0)/100;return a;}
 function hitAt(x,y){const r=reg();if(!r||!active)return null;const a=areaBox();if(x<a.left||x>a.right||y<a.top||y>a.bottom)return null;
   if(!hitCache)hitCache=[...r.items.values()].filter(kindMatches).flatMap(i=>[i,...i.replicas]).filter(i=>i.el.style.display!=='none').map(i=>({i,b:screenBox(i.el)})).filter(({b})=>b.width>0&&b.height>0&&b.right>=a.left&&b.left<=a.right&&b.bottom>=a.top&&b.top<=a.bottom).sort((a,b)=>a.b.width*a.b.height-b.b.width*b.b.height);
   return hitCache.find(({b})=>x>=b.left-5&&x<=b.right+5&&y>=b.top-5&&y<=b.bottom+5)||null;}
 function promote(item){const r=reg(),primary=r.items.get(item.id);if(primary!==item){item.replicas=[primary,...primary.replicas.filter(i=>i!==item)];primary.replicas=[];r.items.set(item.id,item);}return item;}
 function showHover(){hoverRaf=0;const h=$('scoreEditorHover');if(!h)return;const hit=active&&!drag&&!menuOpen&&hoverEvent?hitAt(...hoverEvent):null;h.hidden=!hit||selection.has(hit.i.id);if(!h.hidden)rectInOverlay(h,hit.b);overlay.style.cursor=hit?'move':'';}
 function hoverMove(e){if(!active||drag||menuOpen)return;hoverEvent=[e.clientX,e.clientY];if(!hoverRaf)hoverRaf=requestAnimationFrame(showHover);}
 function openText(){const r=reg();if(selection.size!==1||!textEditable(r?.items.get(selected)))return;const input=$('scoreEditorText');input.focus();input.select();}
 function doubleClick(e){if(!active||e.target.closest('#scoreEditorContext'))return;const hit=hitAt(e.clientX,e.clientY);if(!hit||!textEditable(hit.i))return;e.preventDefault();promote(hit.i);select(hit.i.id);sync();schedule();openText();}
 function context(e){if(!active||e.target.closest('#scoreEditorContext'))return;const hit=hitAt(e.clientX,e.clientY);if(!hit){closeMenu();return;}e.preventDefault();promote(hit.i);if(!selection.has(hit.i.id))select(hit.i.id);else selected=hit.i.id;sync();clearHover();schedule();const m=$('scoreEditorContext'),f=overlay.getBoundingClientRect();if(!m)return;menuOpen=true;m.hidden=false;m.style.left=Math.max(0,Math.min(e.clientX-f.left,f.width-m.offsetWidth))+'px';m.style.top=Math.max(0,Math.min(e.clientY-f.top,f.height-m.offsetHeight))+'px';$('scoreEditorContextText').hidden=selection.size!==1||!textEditable(hit.i);$('scoreEditorContextAlignX').disabled=$('scoreEditorContextAlignY').disabled=selection.size<2;}
 function align(axis){const r=reg(),target=r?.items.get(selected);if(!target||selection.size<2)return;const center=b=>axis==='x'?(b.left+b.right)/2:(b.top+b.bottom)/2,at=center(screenBox(target.el)),changes=[];for(const id of selection){const i=r.items.get(id);if(!i||i.el.style.display==='none')continue;const inv=i.el.parentElement.getScreenCTM()?.inverse();if(!inv)continue;const d=at-center(screenBox(i.el)),v=stateFor(r)[id]||base();changes.push([id,{x:v.x+d*(axis==='x'?inv.a:inv.c)/r.zoom,y:v.y+d*(axis==='x'?inv.b:inv.d)/r.zoom}]);}changeMany(changes);}
 function manage(){const r=reg(),box=$('scoreEditorManage');if(!box?.open||!r)return;const q=clean($('scoreEditorSearch').value).toLocaleLowerCase(),hiddenOnly=$('scoreEditorHiddenOnly').checked,edits=stateFor(r);const rows=[...r.items.values()].filter(i=>(!hiddenOnly||edits[i.id]?.hidden)&&(!q||`${itemLabel(i)} ${i.id} ${i.label}`.toLocaleLowerCase().includes(q)));
   const pages=Math.max(1,Math.ceil(rows.length/30));listPage=clamp(listPage,0,pages-1);const key=JSON.stringify([r.source,q,hiddenOnly,listPage,rows.map(i=>[i.id,labelFor(i),!!edits[i.id]?.hidden]),selected,tr('kind_words')]);if(key===listKey)return;listKey=key;const list=$('scoreEditorResults');list.replaceChildren();for(const i of rows.slice(listPage*30,listPage*30+30)){const row=document.createElement('div'),b=document.createElement('button');b.type='button';b.className='score-editor-result';b.dataset.editorId=i.id;b.textContent=itemLabel(i);b.setAttribute('aria-pressed',String(selection.has(i.id)));b.onclick=()=>{closeMenu();select(i.id);sync();schedule();};row.append(b);if(edits[i.id]?.hidden){const restore=document.createElement('button');restore.type='button';restore.textContent=tr('show');restore.onclick=()=>change(i.id,{hidden:false});row.append(restore);}list.append(row);}
   $('scoreEditorResultCount').textContent=`${rows.length} · ${listPage+1}/${pages}`;$('scoreEditorPrev').disabled=listPage===0;$('scoreEditorNext').disabled=listPage+1>=pages;}
 function syncGui(r){if(!$('scoreEditorSelected'))return;const i=r?.items.get(selected),edits=r?stateFor(r):{};$('scoreEditorSelected').textContent=selection.size>1?`${selection.size} ${tr('selected')}`:i?itemLabel(i):tr('empty');$('scoreEditorProperties').hidden=!i;$('scoreEditorFilter').value=filter;for(const c of $('scoreEditorKinds').querySelectorAll('input[data-kind]')){const group=[...(r?.items.values()||[])].filter(i=>i.kind===c.dataset.kind),n=group.filter(i=>edits[i.id]?.hidden).length;c.checked=!!group.length&&n===0;c.indeterminate=n>0&&n<group.length;c.disabled=!group.length;c.parentElement.querySelector('.score-editor-kind-count').textContent=String(group.length);}manage();}
 function bulk(kind,show){const r=reg();if(!r)return;const edits=stateFor(r),changes=[...r.items.values()].filter(i=>i.kind===kind&&!!edits[i.id]?.hidden===show).map(i=>[i.id,{hidden:!show}]);if(!show&&Object.keys(edits).length+changes.filter(([id])=>!edits[id]).length>2000){$('scoreEditorBulkStatus').textContent=tr('limit');syncGui(r);return;}$('scoreEditorBulkStatus').textContent='';changeMany(changes);}
 
 function select(id,add=false){if(!add)selection.clear();if(id){if(add&&selection.has(id))selection.delete(id);else selection.add(id);}selected=selection.has(id)?id:([...selection].at(-1)||'');}
 function selectedIds(){return [...selection];}
 function stateFor(r){return state.source===r.source?state.edits:{};}
 function getState(){return copy(state);}
 function restore(v){state=normalize(v);undo=[];redo=[];select('');if(reg()){apply(reg(),state);invalidate();}sync();}
 function cancelDrag(){if(!drag)return;state=drag.previous;drag=null;apply(reg(),state);invalidate();guide(null,null);}
 function setActive(v){closeMenu();clearHover();cancelDrag();active=!!v&&!!reg()?.items.size&&!suspended&&!stage?.settings.effects.drawScore;if(active){opts.pause?.();root.ScoreVisualEditor?.setEditing(false);}drag=null;select('');sync();schedule(true);}
 function bindStage(s){closeMenu();clearHover();hitCache=null;listKey='';listPage=0;filter='all';cancelDrag();stage=s;active=false;drag=null;select('');undo=[];redo=[];bounds=[];dirtyBounds=true;sync();schedule(true);}
 function onStageLoaded(s){if(stage!==s)return;closeMenu();clearHover();hitCache=null;listKey='';drag=null;if(overlay)guide(null,null);for(const id of selection)if(!reg()?.items.has(id))selection.delete(id);if(!selection.has(selected))selected=[...selection].at(-1)||'';if(stage.settings.effects.drawScore)active=false;sync();schedule(true);}
 function suspend(v){suspended=!!v;if(v)setActive(false);schedule(true);}
 function invalidate(){hitCache=null;if(!stage||!reg())return;stage.settings.scoreEdits=getState();stage.follower.effects.scoreEdits=getState();stage.follower.scoreEditorNeedsDrawingRebuild=true;for(const svg of reg().container.querySelectorAll('svg'))svg.setAttribute('data-score-editor-revision',String((Number(svg.getAttribute('data-score-editor-revision'))||0)+1));root.ScoreMotionBit?.mark(stage);dirtyBounds=true;}
 function snapshot(){undo.push(getState());if(undo.length>50)undo.shift();redo=[];}
 function changeMany(changes,history=true){const r=reg();if(!r)return;changes=changes.filter(([id])=>r.items.has(id));if(!changes.length)return;if(history)snapshot();if(state.source!==r.source)state={version:1,source:r.source,edits:{}};
   for(const [id,patch] of changes)state.edits[id]={...(state.edits[id]||base()),...patch};state=normalize(state);for(const [id] of changes)applyItem(r,r.items.get(id),state.edits[id]);invalidate();sync();schedule(true);if(history)opts.onChange?.();}
 function change(id,patch,history=true){changeMany([[id,patch]],history);}
 function revert(all=false){if(!reg())return;snapshot();if(all)state=defaults();else for(const id of selection)delete state.edits[id];apply(reg(),state);invalidate();sync();schedule(true);opts.onChange?.();}
 function history(back){const from=back?undo:redo,to=back?redo:undo;if(!from.length||!reg())return;to.push(getState());state=from.pop();apply(reg(),state);invalidate();sync();schedule(true);opts.onChange?.();}
 function screenBox(el){const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};}
 function transformedBox(b,m){if(!m)return null;const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};}
 function measure(){bounds=[];if(!reg())return;for(const svg of reg().container.querySelectorAll('svg')){try{const b=svg.getBBox();if(b.width||b.height)bounds.push({svg,b:{x:b.x,y:b.y,width:b.width,height:b.height}});}catch(_){}}dirtyBounds=false;}
 function rectInOverlay(el,b){const f=overlay.getBoundingClientRect();Object.assign(el.style,{left:(b.left-f.left)+'px',top:(b.top-f.top)+'px',width:Math.max(0,b.right-b.left)+'px',height:Math.max(0,b.bottom-b.top)+'px'});}
 function renderOverlay(){raf=0;if(!overlay)return;const r=reg(),win=stage?.scoreWindow;overlay.hidden=suspended||!r||!win||!stage.settings.scoreVisible||win.hidden; if(overlay.hidden)return;
   overlay.classList.toggle('is-editing',active);const area=screenBox(win);area.top+=(area.bottom-area.top)*(stage.settings.scoreRegion.cropTopPercent||0)/100;
   let b=[];if(stage.settings.scrollMode==='horizontal'){if(dirtyBounds&&!drag)measure();b=bounds.map(v=>transformedBox(v.b,v.svg.getScreenCTM())).filter(Boolean);if(drag){for(const id of selection){const item=r.items.get(id);for(const node of item?[item,...item.replicas]:[]){const el=node.el;if(el.style.display!=='none')b.push(screenBox(el));}}}}
   else { // vertical/page scrolling is intentional; only check edited directions whose original anchor is on screen.
     for(const [id,e] of Object.entries(stateFor(r))){const item=r.items.get(id);if(!item||e.hidden)continue;for(const node of [item,...item.replicas]){const current=screenBox(node.el),ctm=node.el.parentElement.getScreenCTM();if(!ctm)continue;const dy=e.x*r.zoom*ctm.b+e.y*r.zoom*ctm.d;const center=(current.top+current.bottom)/2-dy;if(center>=area.top&&center<=area.bottom)b.push(current);}}}
   const warn=overflow(b,area);const border=$('scoreEditorBounds');rectInOverlay(border,area);border.classList.toggle('over-top',warn.top);border.classList.toggle('over-bottom',warn.bottom);border.hidden=!warn.top&&!warn.bottom;
   const box=$('scoreEditorSelection'),boxes=selectedIds().map(id=>r.items.get(id)?.el).filter(el=>el&&el.style.display!=='none').map(screenBox);box.hidden=!active||!boxes.length;if(!box.hidden)rectInOverlay(box,{left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))});
   const status=$('scoreEditorWarning');if(status){status.hidden=!warn.top&&!warn.bottom;status.textContent=tr(warn.top&&warn.bottom?'both':warn.top?'top':'bottom');}
 }
 function schedule(remeasure=false){hitCache=null;if(remeasure)dirtyBounds=true;if(!raf&&overlay)raf=requestAnimationFrame(renderOverlay);}
 function sync(){if(!$('scoreEditorToggle'))return;const r=reg(),enabled=!!r?.items.size&&!suspended&&!stage?.settings.effects.drawScore;if(!enabled)active=false;
   $('scoreEditorToggle').disabled=!enabled;$('scoreEditorToggle').setAttribute('aria-pressed',String(active));$('scoreEditorControls').hidden=!active;

   const e=r&&stateFor(r)[selected]||base();for(const [id,v] of [['scoreEditorX',e.x],['scoreEditorY',e.y],['scoreEditorScale',Math.round(e.scale*100)]]){const n=$(id);n.disabled=selection.size!==1;if(document.activeElement!==n)n.value=String(Math.round(v*100)/100);}
   const hidden=selectedIds().map(id=>!!stateFor(r)[id]?.hidden);$('scoreEditorHide').checked=hidden.length>0&&hidden.every(Boolean);$('scoreEditorHide').indeterminate=hidden.some(Boolean)&&!hidden.every(Boolean);$('scoreEditorHide').disabled=!selected;
   const words=selection.size===1&&textEditable(r?.items.get(selected)),panel=$('scoreEditorTextControls');if(panel){panel.hidden=!words;const item=r?.items.get(selected);for(const [id,value] of [['scoreEditorText',e.text??item?.originalText??''],['scoreEditorFont',e.font||''],['scoreEditorWeight',e.weight||''],['scoreEditorItalic',e.italic||'']]){const n=$(id);n.disabled=!words;if(document.activeElement!==n)n.value=value;}}const count=$('scoreEditorSelectionCount');if(count)count.textContent=selection.size>1?`${selection.size} ×`:'';$('scoreEditorReset').disabled=!selected;$('scoreEditorUndo').disabled=!undo.length;$('scoreEditorRedo').disabled=!redo.length;
   $('scoreEditorMagnet').checked=magnet;syncGui(r); if(overlay){overlay.classList.toggle('is-editing',active);overlay.setAttribute('aria-hidden',String(!active));}
 }
 function guide(x,y){const f=overlay.getBoundingClientRect();const gx=$('scoreEditorGuideX'),gy=$('scoreEditorGuideY');gx.hidden=x==null;gy.hidden=y==null;if(x!=null)gx.style.left=(x-f.left)+'px';if(y!=null)gy.style.top=(y-f.top)+'px';}
 function pointerDown(e){if(!active||e.button!==0||suspended||e.target.closest('#scoreEditorContext'))return;closeMenu();clearHover();const r=reg(),a=areaBox();if(e.clientX<a.left||e.clientX>a.right||e.clientY<a.top||e.clientY>a.bottom)return;
   const hit=hitAt(e.clientX,e.clientY);if(!hit){if(!e.shiftKey)select('');sync();schedule();return;}promote(hit.i);e.preventDefault();if(e.shiftKey){select(hit.i.id,true);sync();schedule();return;}if(!selection.has(hit.i.id))select(hit.i.id);else selected=hit.i.id;const old=stateFor(r)[selected]||base(),m=hit.i.el.parentElement.getScreenCTM();if(!m)return;const inv=m.inverse(),p=new DOMPoint(e.clientX,e.clientY).matrixTransform(inv);const anchorsX=[],anchorsY=[],baselines=[];const baseline=i=>{const t=i.text;if(!t)return null;const m=t.getScreenCTM(),x=Number(t.getAttribute('x')),y=Number(t.getAttribute('y'));return m&&Number.isFinite(x)&&Number.isFinite(y)?new DOMPoint(x,y).matrixTransform(m).y:null;};
   for(const i of [...r.items.values()].flatMap(i=>[i,...i.replicas])){if(selection.has(i.id)||i.el.style.display==='none')continue;const b=screenBox(i.el);if(b.right<a.left||b.left>a.right||b.bottom<a.top||b.top>a.bottom)continue;anchorsX.push((b.left+b.right)/2);anchorsY.push((b.top+b.bottom)/2);const line=baseline(i);if(line!=null)baselines.push(line);}
   // Note anchors are collected only on pointer-down, never during playback.
   for(const n of stage.follower.noteTriggers||[]){const h=n.headEl;if(!h)continue;const b=screenBox(h);if(b.right>=a.left&&b.left<=a.right&&b.bottom>=a.top&&b.top<=a.bottom)anchorsX.push((b.left+b.right)/2);}
   anchorsX.push((a.left+a.right)/2);anchorsY.push((a.top+a.bottom)/2);drag={id:selected,pointer:e.pointerId,old:{...old},p,inv,m,initial:hit.b,anchorsX,anchorsY,baselines,baseline:baseline(hit.i),previous:getState(),moved:false,group:selectedIds().map(id=>{const item=r.items.get(id),m=item.el.parentElement.getScreenCTM();return {id,old:{...(stateFor(r)[id]||base())},inv:m?.inverse()};}).filter(g=>g.inv)};// Cache all OTHER engraving bounds once, so the warning can clear during
   // the drag as well as after release without rescanning the whole SVG.
   if(stage.settings.scrollMode==='horizontal'){const displays=selectedIds().flatMap(id=>{const i=r.items.get(id);return [i,...i.replicas].map(n=>n.el);}).map(el=>[el,el.style.display]);try{for(const [el] of displays)el.style.display='none';measure();}finally{for(const [el,display] of displays)el.style.display=display;}}
   overlay.setPointerCapture(e.pointerId);sync();schedule();}
 function pointerMove(e){if(!drag||e.pointerId!==drag.pointer)return;const d=drag,r=reg(),p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.inv);let dx=p.x-d.p.x,dy=p.y-d.p.y,lockX=false,lockY=false;if(e.shiftKey){if(Math.abs(dx)>Math.abs(dy)){dy=0;lockY=true;}else{dx=0;lockX=true;}}let sx=null,sy=null;if(!d.moved&&Math.hypot(e.clientX-(d.m.a*d.p.x+d.m.c*d.p.y+d.m.e),e.clientY-(d.m.b*d.p.x+d.m.d*d.p.y+d.m.f))<2)return;
   if(magnet&&!e.altKey){const cx=(d.initial.left+d.initial.right)/2+d.m.a*dx+d.m.c*dy,cy=(d.initial.top+d.initial.bottom)/2+d.m.b*dx+d.m.d*dy;const x=lockX?null:snap(cx,d.anchorsX);const y=lockY?null:((d.baseline!=null?snap(d.baseline+d.m.b*dx+d.m.d*dy,d.baselines):null)||snap(cy,d.anchorsY));const vx=x?.delta||0,vy=y?.delta||0;dx+=d.inv.a*vx+d.inv.c*vy;dy+=d.inv.b*vx+d.inv.d*vy;sx=x?.target??null;sy=y?.target??null;}
   if(!d.moved&&Math.hypot(dx,dy)<.5)return;d.moved=true;const vx=d.m.a*dx+d.m.c*dy,vy=d.m.b*dx+d.m.d*dy;changeMany(d.group.map(g=>[g.id,{x:g.old.x+(g.inv.a*vx+g.inv.c*vy)/r.zoom,y:g.old.y+(g.inv.b*vx+g.inv.d*vy)/r.zoom}]),false);guide(sx,sy);}
 function pointerEnd(e){if(!drag||e.pointerId!==drag.pointer)return;const d=drag;drag=null;guide(null,null);if(e.type==='pointercancel'){state=d.previous;apply(reg(),state);invalidate();}else if(d.moved){undo.push(d.previous);if(undo.length>50)undo.shift();redo=[];opts.onChange?.();}sync();schedule(true);}
 function handleKey(e){if(!active||e.target?.closest?.('input,select,textarea,[contenteditable]'))return false;let handled=true;const mod=e.metaKey||e.ctrlKey;if(e.key==='Escape')setActive(false);else if(mod&&e.key.toLowerCase()==='z')history(!e.shiftKey);else if(selected&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const n=e.shiftKey?10:1;changeMany(selectedIds().map(id=>{const v=stateFor(reg())[id]||base();return [id,{x:v.x+(e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0),y:v.y+(e.key==='ArrowDown'?n:e.key==='ArrowUp'?-n:0)}];}));}else if(selected&&(e.key==='Delete'||e.key==='Backspace'))changeMany(selectedIds().map(id=>[id,{hidden:true}]));else handled=false;if(handled){e.preventDefault();e.stopImmediatePropagation();}return handled;}
 function init(options){opts=options||{};overlay=$('scoreEditorOverlay');if(!overlay)return;$('scoreEditorToggle').onclick=()=>setActive(!active);$('scoreEditorFilter').onchange=e=>{filter=e.target.value;hitCache=null;clearHover();closeMenu();select('');sync();schedule();};$('scoreEditorKinds').addEventListener('change',e=>{if(e.target.dataset.kind)bulk(e.target.dataset.kind,e.target.checked);});$('scoreEditorManage').addEventListener('toggle',()=>{listKey='';manage();});for(const id of ['scoreEditorSearch','scoreEditorHiddenOnly'])$(id).addEventListener(id==='scoreEditorSearch'?'input':'change',()=>{listPage=0;manage();});$('scoreEditorPrev').onclick=()=>{listPage--;manage();};$('scoreEditorNext').onclick=()=>{listPage++;manage();};$('scoreEditorContextHide').onclick=()=>{closeMenu();changeMany(selectedIds().map(id=>[id,{hidden:true}]));};$('scoreEditorContextReset').onclick=()=>{closeMenu();revert();};$('scoreEditorContextText').onclick=()=>{closeMenu();openText();};$('scoreEditorContextAlignX').onclick=()=>{closeMenu();align('x');};$('scoreEditorContextAlignY').onclick=()=>{closeMenu();align('y');};$('scoreEditorMagnet').onchange=e=>{magnet=e.target.checked;};for(const [id,k,div] of [['scoreEditorX','x',1],['scoreEditorY','y',1],['scoreEditorScale','scale',100]])$(id).onchange=e=>{if(selection.size===1)change(selected,{[k]:num(e.target.value,0)/div});};$('scoreEditorHide').onchange=e=>{if(selected)changeMany(selectedIds().map(id=>[id,{hidden:e.target.checked}]));};for(const [id,k] of [['scoreEditorText','text'],['scoreEditorFont','font'],['scoreEditorWeight','weight'],['scoreEditorItalic','italic']]){const n=$(id);if(n)n.onchange=e=>{if(selection.size!==1||!textEditable(reg()?.items.get(selected)))return;const item=reg().items.get(selected),v=e.target.value;change(selected,{[k]:k==='text'&&v===item.originalText?'':v});};}$('scoreEditorReset').onclick=()=>revert();$('scoreEditorResetAll').onclick=()=>revert(true);$('scoreEditorUndo').onclick=()=>history(true);$('scoreEditorRedo').onclick=()=>history(false);overlay.addEventListener('pointerdown',pointerDown);overlay.addEventListener('pointermove',e=>{if(drag)pointerMove(e);else hoverMove(e);});overlay.addEventListener('pointerleave',clearHover);overlay.addEventListener('dblclick',doubleClick);overlay.addEventListener('contextmenu',context);document.addEventListener('pointerdown',e=>{if(menuOpen&&!e.target.closest('#scoreEditorContext'))closeMenu();},true);overlay.addEventListener('pointerup',pointerEnd);overlay.addEventListener('pointercancel',pointerEnd);$('editScoreAreaButton')?.addEventListener('click',()=>{if(active)setActive(false);});$('editScoreFromSidebar')?.addEventListener('click',()=>{if(active)setActive(false);});window.addEventListener('resize',()=>schedule());new ResizeObserver(()=>schedule()).observe($('stageFrame'));sync();}
 // Called only from preview UI, never from the offline rendering loop.
 function previewChanged(){sync();schedule(true);}
 let lastSeek=0;function onSeek(s){if(stage!==s||suspended||!reg())return;const now=performance.now();if(now-lastSeek>150){lastSeek=now;clearHover();schedule();}}
 root.ScoreEditor={render,attach,normalize,restore,getState,init,bindStage,onStageLoaded,onSeek,suspend,handleKey,previewChanged,setActive,_test:{catalog,match,apply,applyItem,fingerprint,snap,overflow,change,history,renderOverlay,selectedIds}};
})(window);
