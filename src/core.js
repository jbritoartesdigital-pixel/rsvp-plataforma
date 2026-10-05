export class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
export const fail = (status,message) => { throw new HttpError(status,message); };
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const token = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const unb64 = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const hash = async value => b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
export const stmt = (env,sql,...args) => env.DB.prepare(sql).bind(...args);
export const one = (env,sql,...args) => stmt(env,sql,...args).first();
export const all = async (env,sql,...args) => (await stmt(env,sql,...args).all()).results;
export const run = (env,sql,...args) => stmt(env,sql,...args).run();
export const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
export async function body(request) {
 if (Number(request.headers.get('content-length')) > 100000) fail(413,'Dados muito grandes.');
 const raw=await request.text(); if(raw.length>100000) fail(413,'Dados muito grandes.');
 try { const result=JSON.parse(raw); if(!result || Array.isArray(result) || typeof result!=='object') throw Error(); return result; }
 catch { fail(400,'JSON inválido.'); }
}
export function text(value,max=160,required=true) {
 const v=String(value??'').trim(); if(v.length>max || (required && !v)) fail(400,'Preencha os campos com valores válidos.'); return v;
}
export function integer(value,min,max) { const n=Number(value); if(!Number.isInteger(n)||n<min||n>max) fail(400,'Quantidade inválida.'); return n; }
export function choice(value,values) { if(!values.includes(value)) fail(400,'Opção inválida.'); return value; }
export function slug(value) { const v=text(value,64); if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)||['api','app','admin','q','cliente','planos','termos','privacidade','media'].includes(v)) fail(400,'Use um endereço com letras minúsculas, números e hífens.'); return v; }
export function date(value) { if(!value) return null; const d=new Date(value); if(!Number.isFinite(d.getTime())) fail(400,'Data inválida.'); return d.toISOString(); }
export async function audit(env,studio,actor,action,details={}) { return run(env,'INSERT INTO audit_logs(id,studio_id,actor_id,action,details,created_at,event_id,guest_id) VALUES(?,?,?,?,?,?,?,?)',id(),studio??null,actor??null,action,JSON.stringify(details),now(),details.event_id??null,details.guest_id??null); }
export async function limit(env,key,max=20) {
 const bucket=Math.floor(Date.now()/60000); const k=await hash(`${key}:${bucket}`);
 const row=await stmt(env,`INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits`,k,bucket+2).first();
 if(row.hits>max) fail(429,'Aguarde um minuto e tente novamente.');
 await run(env,'DELETE FROM rate_limits WHERE expires_at < ?',bucket);
}
export function safeObject(value,max=12000) {
 if(!value || Array.isArray(value)||typeof value!=='object') fail(400,'Configuração inválida.');
 const s=JSON.stringify(value); if(s.length>max) fail(400,'Configuração muito grande.'); return s;
}
