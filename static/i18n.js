/* ScoreVideo Studio localization runtime.
 * Translatable copy lives in /static/locales/{ko,en}.json, NOT in this file.
 *
 * New UI: use ScoreI18n.t('score.zoom') or <span data-i18n="score.zoom">.
 * Existing UI: legacy text and dynamically generated messages remain supported.
 * Never translate score SVG, MusicXML text or user-provided project titles.
 */
(function(root){
  'use strict';
  const languages=['ko','en'];
  const attributes=['title','aria-label','aria-description','aria-valuetext','placeholder','alt'];
  const storageKey='scorevideo_language';
  const packs=Object.create(null);
  const patterns=Object.create(null);
  const textHistory=new WeakMap();
  const attributeHistory=new WeakMap();
  let applying=false;
  let locale='ko';
  try { const saved=root.localStorage.getItem(storageKey);if(languages.includes(saved))locale=saved; }catch(_){ /* private storage */ }
  const script=document.currentScript;
  const packBase=new URL('./locales/',script?.src||new URL('static/i18n.js',document.baseURI).href);

  // User data and musical notation must never be interpreted as interface copy.
  function ignored(element){
    return !!(element?.closest?.('script,style,textarea,pre,code,svg,#osmdContainer,[contenteditable],[data-i18n-ignore]'));
  }
  function interpolate(template,values={}){
    return String(template).replace(/\{([\w.]+)\}/g,(match,key)=>
      Object.prototype.hasOwnProperty.call(values,key)?String(values[key]):match);
  }
  function t(key,values={}){
    const item=packs[locale]?.messages?.[key]??packs.ko?.messages?.[key];
    if(item==null){
      if(packs.ko&&root.console?.warn)root.console.warn('[ScoreI18n] missing message:',key);
      return key;
    }
    return interpolate(item,values);
  }
  function translate(source){
    const content=String(source??'');
    if(locale==='ko'||!packs[locale])return content;
    const trimmed=content.trim();
    if(!trimmed)return content;
    const entry=packs[locale].legacy?.[trimmed];
    if(entry!==undefined)return content.replace(trimmed,entry);
    for(const rule of patterns[locale]||[]){
      // An anchored Korean source pattern translates variable UI messages;
      // dynamically injected filenames/titles are never treated as message IDs.
      if(rule.regex.test(trimmed)){
        return content.replace(trimmed,trimmed.replace(rule.regex,rule.template));
      }
    }
    return content;
  }
  function translateText(node,mutation=false){
    if(ignored(node.parentElement))return;
    let history=textHistory.get(node);
    if(!history || (mutation&&node.nodeValue!==history.rendered)){
      history={source:node.nodeValue,rendered:node.nodeValue};
      textHistory.set(node,history);
    }
    const element=node.parentElement;
    const key=element?.dataset?.i18n;
    // data-i18n is for a leaf element only: never destroy child markup.
    const explicit=key && element.childElementCount===0;
    const value=explicit ? (packs[locale]?.messages?.[key]??packs.ko?.messages?.[key]??history.source)
      : translate(history.source);
    if(node.nodeValue!==value)node.nodeValue=value;
    history.rendered=value;
  }
  function translateAttribute(el,name,mutation=false){
    if(ignored(el))return;
    let all=attributeHistory.get(el);
    if(!all){all=Object.create(null);attributeHistory.set(el,all);}
    let record=all[name];
    const value=el.getAttribute(name)||'';
    if(!record || (mutation&&value!==record.rendered)){
      record={source:value,rendered:value};all[name]=record;
    }
    const explicit=el.getAttribute('data-i18n-'+name);
    const translated=explicit
      ? (packs[locale]?.messages?.[explicit]??packs.ko?.messages?.[explicit]??record.source)
      : translate(record.source);
    if(value!==translated)el.setAttribute(name,translated);
    record.rendered=translated;
  }
  function processElement(el,mutation=false){
    if(ignored(el))return;
    for(const attr of attributes)if(el.hasAttribute(attr))translateAttribute(el,attr,mutation);
    if(el.hasAttribute('data-i18n')&&el.childElementCount===0&&!el.firstChild){
      el.appendChild(document.createTextNode(''));
    }
  }
  function walk(node,mutation=false){
    if(node.nodeType===3){translateText(node,mutation);return;}
    if(node.nodeType!==1||ignored(node))return;
    processElement(node,mutation);
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{
      acceptNode(n){
        if(n.nodeType===1&&ignored(n))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let current;
    while((current=walker.nextNode())){
      if(current.nodeType===3)translateText(current,mutation);
      else processElement(current,mutation);
    }
  }
  function applyLocale(){
    if(!packs[locale])return;
    applying=true;
    try{
      walk(document.head,false);
      walk(document.body,false);
    }finally{applying=false;}
    document.dispatchEvent(new CustomEvent('scorevideo:languagechange',{detail:{locale}}));
  }
  function setLocale(next){
    locale=languages.includes(next)?next:'ko';
    try{root.localStorage.setItem(storageKey,locale);}catch(_){ /* private storage */ }
    document.documentElement.lang=locale;
    const select=document.getElementById('languageSelect');if(select)select.value=locale;
    if(packs[locale]){applyLocale();return Promise.resolve(locale);}
    return ready.then(()=>{if(packs[locale])applyLocale();return locale;});
  }
  const observer=new MutationObserver(records=>{
    if(applying||!packs[locale])return;
    applying=true;
    try{
      for(const record of records){
        if(record.type==='characterData')translateText(record.target,true);
        else if(record.type==='attributes')processElement(record.target,true);
        else for(const node of record.addedNodes){
          if(node.nodeType===1||node.nodeType===3)walk(node,true);
        }
      }
    }finally{applying=false;}
  });
  observer.observe(document.body,{
    subtree:true,childList:true,characterData:true,attributes:true,
    attributeFilter:[...attributes,'data-i18n',...attributes.map(a=>'data-i18n-'+a)]
  });
  const select=document.getElementById('languageSelect');
  if(select){
    select.value=locale;
    select.addEventListener('change',()=>{void setLocale(select.value);});
  }
  document.documentElement.lang=locale;
  async function loadPack(code){
    const response=await fetch(new URL(code+'.json',packBase));
    if(!response.ok)throw Error('HTTP '+response.status+' '+code+'.json');
    const pack=await response.json();
    if(pack.locale!==code||!pack.messages||!pack.legacy||!Array.isArray(pack.patterns)){
      throw Error('Invalid locale pack: '+code);
    }
    packs[code]=pack;
    patterns[code]=pack.patterns.map(item=>({regex:new RegExp(item.pattern,item.flags||''),template:item.template}));
  }
  const ready=Promise.all(languages.map(loadPack))
    .then(()=>{applyLocale();return true;})
    .catch(error=>{root.console?.error?.('[ScoreI18n] language pack load failed:',error);return false;});
  root.ScoreI18n={
    get locale(){return locale;},
    get ready(){return ready;},
    setLocale,t,translate,
    get loaded(){return !!packs.ko&&!!packs.en;}
  };
})(window);
