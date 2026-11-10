/* ScoreVideo 0.17: image palette UI; pure color application stays in app.js. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const validHex=c=>/^#[0-9a-f]{6}$/i.test(c||'');
 function chips(palette){
   const host=$('paletteChips');host.replaceChildren();
   for(const item of palette){
     if(!validHex(item.hex))continue;
     const el=document.createElement('div');el.className='palette-chip';el.title=`${item.name} · ${item.hex}`;
     const swatch=document.createElement('i');swatch.style.backgroundColor=item.hex;
     const value=document.createElement('span');value.textContent=item.hex.toUpperCase();
     el.append(swatch,value);host.appendChild(el);
   }
 }
 function schemes(items,onSelect){
   const host=$('paletteSchemes');host.replaceChildren();
   for(const scheme of items){
     if(!scheme.colors||!validHex(scheme.colors.paper)||!validHex(scheme.colors.ink))continue;
     const btn=document.createElement('button');btn.type='button';btn.className='palette-scheme';btn.dataset.schemeId=scheme.id;
     const preview=document.createElement('div');preview.className='palette-scheme-preview';preview.style.backgroundColor=scheme.colors.paper;
     const line=document.createElement('span');line.className='palette-music-sample';line.style.color=scheme.colors.ink;
     line.textContent='𝄞  ♩  ♪  ♫';preview.appendChild(line);
     const meta=document.createElement('span');meta.className='palette-scheme-meta';
     const name=document.createElement('strong');name.textContent=scheme.name;
     const description=document.createElement('small');description.textContent=scheme.description;
     const paletteStrip=document.createElement('span');paletteStrip.className='palette-scheme-strip';
     for(const key of ['paper','ink','staff','accent','glow']){
       const swatch=document.createElement('i');swatch.style.backgroundColor=scheme.colors[key];swatch.title=`${key}: ${scheme.colors[key]}`;paletteStrip.appendChild(swatch);
     }
     meta.append(name,description,paletteStrip);btn.append(preview,meta);
     btn.addEventListener('click',()=>{
       for(const other of host.querySelectorAll('.palette-scheme'))other.classList.toggle('chosen',other===btn);
       onSelect(scheme);
     });host.appendChild(btn);
   }
 }
 root.ScoreImagePaletteUI={chips,schemes};
})(typeof window!=='undefined'?window:globalThis);
