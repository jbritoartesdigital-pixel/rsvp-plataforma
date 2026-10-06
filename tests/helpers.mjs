import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
export class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');for(const file of ['0001_commercial.sql','0002_original_feature_parity.sql','0003_optional_people_limits.sql','0004_v3_gap_package.sql'])this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
 prepare(sql){const db=this.db;return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){const result=db.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}};}
 async batch(queries){this.db.exec('BEGIN');try{const results=[];for(const q of queries)results.push(await q.run());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
export function fixture(){
 const mediaStore=new Map();
 const env={DB:new D1(),APP_ORIGIN:'https://rsvp.example',RP_ID:'rsvp.example',MP_ACCESS_TOKEN:'test-only',MP_WEBHOOK_SECRET:'test-secret',MP_COLLECTOR_ID:'123',MONTHLY_CENTS:'2990',CREDIT_1_CENTS:'1490',CREDIT_5_CENTS:'6490',CREDIT_10_CENTS:'10990',GRACE_DAYS:'0',ASSETS:{fetch:async()=>new Response('static')},MEDIA:{
  async put(key,value,options={}){mediaStore.set(key,{bytes:value instanceof ArrayBuffer?value:value.buffer,httpMetadata:options.httpMetadata||{},httpEtag:'test-etag'});},
  async get(key){const item=mediaStore.get(key);return item?{body:item.bytes,httpMetadata:item.httpMetadata,httpEtag:item.httpEtag}:null;},
  async delete(key){mediaStore.delete(key);},
  async list(){return {objects:[...mediaStore.keys()].slice(0,1).map(key=>({key}))};}
 }};
 const calls=[],resources=new Map();let sequence=0;
 env.MP_FETCH=async(url,options)=>{
  const path=new URL(url).pathname;calls.push({path,method:options.method,data:options.body?JSON.parse(options.body):null,key:options.headers['X-Idempotency-Key']});
  if(options.method==='POST')return Response.json({id:`provider-${++sequence}`,init_point:'https://www.mercadopago.com.br/checkout/test'});
  if(options.method==='PUT')return Response.json({id:path.split('/').pop(),status:'cancelled'});
  if(!resources.has(path))return Response.json({error:'missing fixture'},{status:404});return Response.json(resources.get(path));
 };
 async function request(path,method='GET',data,cookie,origin=env.APP_ORIGIN){const r=await worker.fetch(new Request(env.APP_ORIGIN+path,{method,headers:{origin,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function register(n='a'){const r=await request('/api/auth/register','POST',{name:`Pessoa ${n}`,brand:`Marca ${n}`,slug:`marca-${n}`,whatsapp:'11999999999',email:`${n}@example.com`,password:'senha-bem-longa-123'});if(r.status!==201)throw Error(JSON.stringify(r));const me=await request('/api/auth/me','GET',null,r.cookie);return {cookie:r.cookie,user:me.body.user};}
 async function webhook(type,resource){const ts=String(Math.floor(Date.now()/1000)),rid='request-test',key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.MP_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const manifest=`id:${String(resource).toLowerCase()};request-id:${rid};ts:${ts};`;const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(manifest))).toString('hex');const r=await worker.fetch(new Request(`${env.APP_ORIGIN}/api/webhooks/mercadopago?data.id=${resource}`,{method:'POST',headers:{'content-type':'application/json','x-request-id':rid,'x-signature':`ts=${ts},v1=${signature}`},body:JSON.stringify({type,data:{id:String(resource)}})}),env);return {status:r.status,body:await r.json()};}
 const sql=(query,...args)=>env.DB.db.prepare(query).get(...args);
 const exec=(query,...args)=>env.DB.db.prepare(query).run(...args);
 return {env,request,register,webhook,resources,calls,sql,exec,mediaStore};
}
export const approved=(id,order,amount=14.9)=>({id,external_reference:order,collector_id:123,currency_id:'BRL',transaction_amount:amount,status:'approved',transaction_amount_refunded:0});
