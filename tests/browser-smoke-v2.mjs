import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {fixture,approved} from './helpers.mjs';
import worker from '../src/index.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const f=fixture(),root=resolve('public');
let browser;
f.env.APP_ORIGIN='http://localhost:8788';
f.env.RP_ID='localhost';
f.env.ASSETS.fetch=async request=>{
 let path=resolve(root,'.'+new URL(request.url).pathname);
 if(!path.startsWith(root))return new Response('',{status:404});
 let bytes;
 try{bytes=await readFile(path);}catch{path=resolve(root,'index.html');bytes=await readFile(path);}
 return new Response(bytes,{headers:{'content-type':({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[extname(path)]||'application/octet-stream'}});
};
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
  const response=await worker.fetch(new Request(f.env.APP_ORIGIN+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})}),f.env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('local test failure');}
});
await new Promise(r=>server.listen(8788,r));

try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});

 const seed=Date.now().toString(36),email=`qa-${seed}@example.test`,password=`Qa-${crypto.randomUUID()}-9a`;
 await page.goto(f.env.APP_ORIGIN+'/app/cadastro');
 for(const [name,value]of Object.entries({name:'Teste QA',brand:'Ateliê QA',slug:`atelie-${seed}`,email,whatsapp:'11999999999',password}))await page.locator(`[name=${name}]`).fill(value);
 await page.getByRole('button',{name:'Criar minha conta',exact:true}).click();
 await page.waitForURL('**/app/financeiro');await page.getByRole('heading',{name:'Plano e créditos'}).waitFor();

 const call=async(path,data)=>{
  const r=await page.request.post(f.env.APP_ORIGIN+path,{headers:{origin:f.env.APP_ORIGIN},data});
  assert.ok(r.ok(),await r.text());return r.json();
 };
 const checkout=await call('/api/billing/checkout',{plan:'credits_5'});
 f.resources.set('/v1/payments/301',approved(301,checkout.order_id,39.9));
 assert.equal((await f.webhook('payment','301')).status,200);

 await page.goto(f.env.APP_ORIGIN+'/app/eventos/novo');
 await page.locator('[name=title]').fill('Celebração QA');
 await page.locator('[name=slug]').fill('celebracao');
 await page.locator('[name=checkin_mode]').selectOption('family');
 await page.getByRole('button',{name:'Criar evento',exact:true}).click();
 await page.waitForURL(/\/app\/eventos\/[a-f0-9-]+$/);await page.getByRole('heading',{name:'Celebração QA'}).waitFor();
 const eventId=page.url().split('/').pop();

 await page.goto(f.env.APP_ORIGIN+`/atelie-${seed}/celebracao`);
 await page.locator('[name=name]').fill('Maria');
 await page.locator('[name=members]').fill('Maria\nPedro; criança');
 await page.getByRole('button',{name:'Enviar resposta',exact:true}).click();
 await page.getByRole('heading',{name:'Presença confirmada!'}).waitFor();
 const qrURL=await page.getByRole('link',{name:'Maria',exact:true}).getAttribute('href');
 assert.ok(qrURL?.startsWith('/q/'));
 await page.goto(f.env.APP_ORIGIN+qrURL);await page.locator('#qr').waitFor();
 assert.ok((await page.locator('#qr').getAttribute('src')).startsWith('data:image/png'));
 const registered=await call(`/api/events/${eventId}/checkins`,{token:qrURL.split('/').pop()});
 assert.equal(registered.already_checked_in,false);

 await page.goto(f.env.APP_ORIGIN+'/app/conta');
 await page.getByRole('button',{name:'Cadastrar este dispositivo'}).click();
 await page.getByRole('button',{name:'Remover',exact:true}).waitFor();
 await page.getByRole('button',{name:'Sair',exact:true}).click();
 await page.waitForURL('**/app/login');
 await page.getByRole('button',{name:'Entrar com digital / Face ID'}).click();
 await page.waitForURL('**/app');await page.getByRole('heading',{name:'Seus eventos'}).waitFor();

 await page.setViewportSize({width:390,height:844});
 await page.goto(f.env.APP_ORIGIN+'/');
 await page.getByRole('heading',{name:/Confirmação de presença sem planilha/}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('Browser smoke v2 aprovado.');
}finally{
 await browser?.close();await new Promise(r=>server.close(r));
}
