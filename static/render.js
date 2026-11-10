(function () {
  'use strict';
  window.__ready=false;window.__renderError=null;
  const id=location.pathname.split('/').pop();
  let stage;
  window.renderAt=(time)=>{if(!stage)throw Error('Scene is not ready');stage.seek(time);};
  (async()=>{
    try {
      const [m,c]=await Promise.all([fetch(`/api/projects/${id}`),fetch(`/api/projects/${id}/render-config`)]);
      if(!m.ok)throw Error(`Project fetch failed: ${m.status}`);
      if(!c.ok)throw Error(`Render configuration fetch failed: ${c.status}`);
      const meta=await m.json(),settings=await c.json();
      stage=new window.ScoreStage.Stage({viewport:document.getElementById('scoreViewport'),
        container:document.getElementById('osmdContainer'),meta,settings});
      await stage.load();document.getElementById('loading').remove();
      stage.seek(0);window.__ready=true;
    }catch(e){window.__renderError=e?.stack||String(e);document.getElementById('loading').textContent=window.__renderError;}
  })();
})();