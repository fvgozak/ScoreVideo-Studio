/**
 * Cloudflare Pages Functions: same-origin proxy for the existing FastAPI API.
 * Static HTML/CSS/JS/Salamander MP3 files are served by Pages without invoking
 * this Function. Python-only work remains on the separately hosted API server.
 */
export async function onRequest({request,env}){
  const origin=String(env.SCOREMOTION_BACKEND_ORIGIN||'').replace(/\/$/,'');
  const secret=String(env.SCOREMOTION_PROXY_SECRET||'');
  let backend;
  try{backend=new URL(origin);}catch(_){/* Not configured */}
  if(!backend||backend.protocol!=='https:'||!secret||backend.username||backend.password||backend.pathname!=='/'||backend.search){
    return new Response('ScoreMotion API backend not configured (HTTPS origin / proxy secret required).',{status:503});
  }
  const original=new URL(request.url);
  if(!original.pathname.startsWith('/api/'))return new Response('Not found',{status:404});
  // Free-plan uploads have a 100 MB Cloudflare request-body limit. Leave margin
  // for multipart overhead so the API can respond with a predictable 413.
  const size=Number(request.headers.get('content-length')||0);
  if(size>90*1024*1024)return new Response('Upload too large for the Cloudflare free-tier proxy (90 MiB limit).',{status:413});
  const upstream=new URL(original.pathname+original.search,backend);
  const headers=new Headers(request.headers);
  headers.delete('host');
  headers.delete('cookie');
  headers.delete('x-scoremotion-proxy-secret');
  headers.delete('authorization');
  headers.set('x-scoremotion-proxy-secret',secret);
  try{
    const response=await fetch(new Request(upstream.toString(),{
      method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,
      redirect:'manual'
    }));
    const resultHeaders=new Headers(response.headers);
    resultHeaders.delete('set-cookie');
    // An unexpected redirect must not expose the private API hostname.
    if(response.status>=300&&response.status<400){
      const location=resultHeaders.get('location');
      if(location){
        const target=new URL(location,backend);
        if(target.origin!==backend.origin||!target.pathname.startsWith('/api/'))
          return new Response('Unexpected API redirect',{status:502});
        resultHeaders.set('location',target.pathname+target.search);
      }
    }
    return new Response(response.body,{status:response.status,headers:resultHeaders});
  }catch(error){
    console.error('ScoreMotion upstream proxy failed:',error?.message||error);
    return new Response('ScoreMotion API is temporarily unavailable.',{status:502});
  }
}
