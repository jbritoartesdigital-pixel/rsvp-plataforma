import {HttpError,fail,one,json} from './core.js';
import {authRoutes} from './auth.js';
import {billingRoutes} from './billing.js';
import {eventsRoutes} from './events.js';
import {adminRoutes} from './admin.js';
const tenantMutationOrigin=(origin,path,env)=>{
 if(origin===env.APP_ORIGIN)return true;
 if(!/^\/api\/(public|cliente)\//.test(path))return false;
 try{
  const u=new URL(origin),host=u.hostname.toLowerCase(),hmlSuffix='.hml.presencaconfirmada.com.br',prodSuffix='.presencaconfirmada.com.br';
  if(u.protocol!=='https:')return false;
  let sub='';
  if(host.endsWith(hmlSuffix))sub=host.slice(0,-hmlSuffix.length);
  else if(host.endsWith(prodSuffix))sub=host.slice(0,-prodSuffix.length);
  else return false;
  return !!sub&&!['app','hml','www'].includes(sub)&&!sub.includes('.');
 }catch{return false;}
};
const security={
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
 'permissions-policy':'camera=(self), publickey-credentials-get=(self)',
 'content-security-policy':"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
export default {
 async fetch(request,env) {
  let response;
  try {
   const url=new URL(request.url),path=url.pathname;
   // Apply Origin protection to every browser mutation, including public RSVP and passkey ceremonies.
   if(!['GET','HEAD'].includes(request.method) && path!=='/api/webhooks/mercadopago') {
    if(!tenantMutationOrigin(request.headers.get('origin'),path,env)) fail(403,'Origem inválida.');
   }
   if(path.startsWith('/api/')) {
    response=await authRoutes(request,env,path)||await billingRoutes(request,env,path,url)||await eventsRoutes(request,env,path,url)||await adminRoutes(request,env,path)||json({error:'Rota não encontrada.'},404);
   } else if(path.startsWith('/media/')) {
    const record=await one(env,"SELECT m.* FROM event_media m JOIN events e ON e.id=m.event_id JOIN studios s ON s.id=m.studio_id WHERE m.id=? AND m.deleted_at IS NULL AND e.status IN ('active','inactive') AND s.status='active'",path.slice(7));
    if(!record) fail(404,'Mídia indisponível.'); const object=await env.MEDIA.get(record.object_key); if(!object) fail(404,'Mídia indisponível.');
    response=new Response(object.body,{headers:{'content-type':record.mime_type,'cache-control':'public, max-age=300','etag':object.httpEtag||''}});
   } else if(path.startsWith('/brand-media/')) {
    const studioId=path.slice('/brand-media/'.length),studio=await one(env,"SELECT id,status,brand FROM studios WHERE id=?",studioId);
    if(!studio||studio.status!=='active')fail(404,'Logo indisponível.');
    const brand=JSON.parse(studio.brand||'{}');if(!String(brand.logo_url||'').startsWith(`/brand-media/${studioId}`))fail(404,'Logo indisponível.');
    const object=await env.MEDIA.get(`studios/${studioId}/brand-logo`);if(!object)fail(404,'Logo indisponível.');
    const h=new Headers();object.writeHttpMetadata?.(h);h.set('cache-control','public, max-age=3600');if(object.httpEtag)h.set('etag',object.httpEtag);response=new Response(object.body,{headers:h});
   } else response=await env.ASSETS.fetch(request);
  } catch(error) {
   if(error instanceof HttpError) response=json({error:error.message},error.status);
   else if(String(error.message).includes('NO_ENTITLEMENT')) response=json({error:'Você precisa de um crédito ou mensalidade vigente para criar um evento.'},402);
   else if(/UNIQUE constraint/i.test(error.message)) response=json({error:'Este cadastro ou endereço já existe. Atualize a página e tente novamente.'},409);
   else { console.error('request_failed',error.name); response=json({error:'Não foi possível concluir. Tente novamente.'},500); }
  }
  const headers=new Headers(response.headers); for(const [k,v] of Object.entries(security)) headers.set(k,v);
  return new Response(response.body,{status:response.status,headers});
 }
};
