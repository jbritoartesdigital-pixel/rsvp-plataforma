import {fail,now,id,stmt,one,all,run,body,integer,choice,hash,audit,json} from './core.js';
import {session,owner} from './auth.js';
export function catalog(env) {
 return [1,5,10].map(n=>({key:`credits_${n}`,kind:'credits',quantity:n,amount_cents:Number(env[`CREDIT_${n}_CENTS`])||null})).concat({key:'monthly',kind:'monthly',quantity:0,amount_cents:Number(env.MONTHLY_CENTS)||2990});
}
const mpTestMode=env=>String(env.MP_ACCESS_TOKEN||'').startsWith('TEST-');
export async function mp(env,path,method='GET',data,key) {
 if(!env.MP_ACCESS_TOKEN) fail(503,'Checkout ainda não configurado.');
 const response=await (env.MP_FETCH||fetch)(`https://api.mercadopago.com${path}`,{method,headers:{authorization:`Bearer ${env.MP_ACCESS_TOKEN}`,'content-type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});
 if(!response.ok) {
  let detail={};try{detail=await response.json();}catch{}
  const code=detail?.cause?.[0]?.code??detail?.code??response.status;
  const message=detail?.cause?.[0]?.description??detail?.message??detail?.error;
  console.error('Mercado Pago request failed',{path,status:response.status,code,message});
  if(String(env.APP_ORIGIN||'').includes('hml.presencaconfirmada.com.br')&&message) fail(502,`Mercado Pago [${code}]: ${String(message).slice(0,180)}`);
  fail(502,'Mercado Pago indisponível. Tente novamente.');
 }
 return response.json();
}
export async function signedWebhook(request,env,url,b) {
 if(!env.MP_WEBHOOK_SECRET) fail(503,'Webhook ainda não configurado.');
 const signature=Object.fromEntries((request.headers.get('x-signature')||'').split(',').map(p=>p.trim().split('=')));
 const resource=url.searchParams.get('data.id'),rid=request.headers.get('x-request-id');
 // The signed ID must match the resource being fetched; never use an unsigned body ID.
 if(!resource || String(b.data?.id)!==resource || !rid || !/^\d+$/.test(signature.ts||'') || !/^[a-f0-9]{64}$/i.test(signature.v1||'')) fail(401,'Assinatura inválida.');
 const seconds=Number(signature.ts)>1e12?Number(signature.ts)/1000:Number(signature.ts);
 if(Math.abs(Date.now()/1000-seconds)>600) fail(401,'Notificação expirada.');
 const manifest=`id:${resource.toLowerCase()};request-id:${rid};ts:${signature.ts};`;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.MP_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.v1.match(/../g),h=>parseInt(h,16));
 if(!await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(manifest))) fail(401,'Assinatura inválida.');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(resource)) fail(400,'Identificador inválido.');
 return resource;
}
function verifyPayment(env,p,order) {
 if(String(p.collector_id)!==String(env.MP_COLLECTOR_ID)) fail(400,'Recebedor inválido.');
 if(p.currency_id!=='BRL'||Math.round(Number(p.transaction_amount)*100)!==order.amount_cents) fail(400,'Valor ou moeda inválidos.');
 if(!['approved','pending','in_process','rejected','cancelled','refunded','charged_back','authorized','in_mediation'].includes(p.status)) fail(400,'Status inválido.');
}
export function periodEnd(value,grace=0) {
 const start=new Date(value); if(!Number.isFinite(start.getTime())) fail(400,'Fatura sem data válida.');
 const day=start.getUTCDate(); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth()+1);
 const last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
 start.setUTCDate(Math.min(day,last)); start.setUTCDate(start.getUTCDate()+integer(grace,0,7)); return start.toISOString();
}
export async function applyCreditPayment(env,p) {
 const order=await one(env,"SELECT * FROM billing_orders WHERE id=? AND kind='credits'",String(p.external_reference||''));
 if(!order) return; verifyPayment(env,p,order);
 const paymentId=String(p.id),stamp=now(),reversed=['refunded','charged_back','cancelled'].includes(p.status)||Number(p.transaction_amount_refunded)>0;
 const status=reversed?'refunded':p.status;
 // A unique purchase per order prevents multiple approved payments crediting one checkout twice.
 // Ledger INSERTs and payment status are one D1 transaction; retries cannot double-credit or double-reverse.
 await env.DB.batch([
  stmt(env,`INSERT INTO payments VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=CASE WHEN payments.status IN ('refunded','charged_back') THEN payments.status ELSE excluded.status END,updated_at=excluded.updated_at`,paymentId,order.id,status,order.amount_cents,stamp),
  stmt(env,"UPDATE billing_orders SET credited_payment_id=? WHERE id=? AND credited_payment_id IS NULL AND EXISTS(SELECT 1 FROM payments WHERE id=? AND status='approved')",paymentId,order.id,paymentId),
  stmt(env,`INSERT OR IGNORE INTO credit_ledger SELECT ?,studio_id,quantity,'purchase',?,? FROM billing_orders WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND status='approved') AND NOT EXISTS(SELECT 1 FROM credit_ledger WHERE source_key=?)`,id(),`order:${order.id}`,stamp,order.id,paymentId,`refund:${order.id}`),
  stmt(env,`INSERT OR IGNORE INTO credit_ledger SELECT ?,studio_id,-quantity,'refund',?,? FROM billing_orders WHERE id=? AND credited_payment_id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND status='refunded') AND EXISTS(SELECT 1 FROM credit_ledger WHERE source_key=?)`,id(),`refund:${order.id}`,stamp,order.id,paymentId,paymentId,`order:${order.id}`),
  stmt(env,`UPDATE billing_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM credit_ledger WHERE source_key=?) THEN 'refunded' WHEN EXISTS(SELECT 1 FROM credit_ledger WHERE source_key=?) THEN 'approved' ELSE ? END WHERE id=?`,`refund:${order.id}`,`order:${order.id}`,status,order.id)
 ]);
}
export async function recomputeMonthly(env,order) {
 await run(env,`UPDATE studios SET monthly_until=(SELECT MAX(i.period_end) FROM subscription_invoices i JOIN payments p ON p.id=i.payment_id WHERE i.order_id=? AND i.status='approved' AND p.status='approved') WHERE id=? AND billing_mode='monthly' AND billing_generation=? AND subscription_id=?`,order.id,order.studio_id,order.generation,order.provider_id);
}
export async function applyInvoice(env,invoice) {
 // subscription_authorized_payment identifies an invoice, never a /v1/payments ID.
 const subscription=await mp(env,`/preapproval/${encodeURIComponent(invoice.preapproval_id)}`);
 const order=await one(env,"SELECT * FROM billing_orders WHERE id=? AND kind='monthly'",String(subscription.external_reference||''));
 if(!order || String(subscription.id)!==order.provider_id) return;
 const paymentId=invoice.payment?.id ?? invoice.payment_id;
 if(!paymentId) return; // A scheduled invoice is not an entitlement.
 const p=await mp(env,`/v1/payments/${encodeURIComponent(paymentId)}`); verifyPayment(env,p,order);
 if(String(p.id)!==String(paymentId)) fail(400,'Pagamento divergente.');
 // Recurring payments can omit external_reference; the invoice and subscription establish the link.
 if(p.external_reference && String(p.external_reference)!==order.id) fail(400,'Referência divergente.');
 const end=periodEnd(invoice.debit_date||invoice.date_created,Number(env.GRACE_DAYS||0));
 const valid=subscription.status==='authorized' && invoice.status==='processed' && p.status==='approved' && !(Number(p.transaction_amount_refunded)>0);
 const status=valid?'approved':(['refunded','charged_back','cancelled'].includes(p.status)||Number(p.transaction_amount_refunded)>0?'refunded':'pending');
 const stamp=now();
 await env.DB.batch([
  stmt(env,`INSERT INTO payments VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=CASE WHEN payments.status IN ('refunded','charged_back') THEN payments.status ELSE excluded.status END,updated_at=excluded.updated_at`,String(p.id),order.id,status,order.amount_cents,stamp),
  stmt(env,`INSERT INTO subscription_invoices VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=CASE WHEN subscription_invoices.status='refunded' THEN 'refunded' ELSE excluded.status END,period_end=excluded.period_end,updated_at=excluded.updated_at`,String(invoice.id),order.id,String(p.id),status,end,stamp),
  stmt(env,`UPDATE studios SET monthly_until=(SELECT MAX(i.period_end) FROM subscription_invoices i JOIN payments p ON p.id=i.payment_id WHERE i.order_id=? AND i.status='approved' AND p.status='approved') WHERE id=? AND billing_mode='monthly' AND billing_generation=? AND subscription_id=?`,order.id,order.studio_id,order.generation,order.provider_id),
  stmt(env,'UPDATE billing_orders SET status=? WHERE id=?',valid?'approved':status,order.id)
 ]);
}
async function processWebhook(request,env,url) {
 const b=await body(request),resource=await signedWebhook(request,env,url,b);
 if(b.type==='subscription_authorized_payment') { const invoice=await mp(env,`/authorized_payments/${resource}`); if(String(invoice.id)!==resource) fail(400,'Fatura divergente.'); await applyInvoice(env,invoice); }
 else if(b.type==='payment') {
  const p=await mp(env,`/v1/payments/${resource}`); if(String(p.id)!==resource) fail(400,'Pagamento divergente.');
  const invoice=await one(env,'SELECT i.order_id FROM subscription_invoices i WHERE i.payment_id=?',resource);
  if(invoice) {
   const order=await one(env,'SELECT * FROM billing_orders WHERE id=?',invoice.order_id); verifyPayment(env,p,order);
   await run(env,"UPDATE payments SET status=CASE WHEN status IN ('refunded','charged_back') THEN status ELSE ? END,updated_at=? WHERE id=?",Number(p.transaction_amount_refunded)>0?'refunded':p.status,now(),resource);
   await recomputeMonthly(env,order);
  } else await applyCreditPayment(env,p);
 }
 else if(b.type==='subscription_preapproval') {
  const p=await mp(env,`/preapproval/${resource}`),order=await one(env,"SELECT * FROM billing_orders WHERE provider_id=? AND kind='monthly'",resource);
  if(order && String(p.external_reference)===order.id) {
   await run(env,'UPDATE billing_orders SET status=? WHERE id=?',String(p.status),order.id);
   if(['cancelled','paused'].includes(p.status)) await run(env,"UPDATE studios SET monthly_until=NULL,subscription_id=NULL,billing_generation=billing_generation+1,billing_mode='credits' WHERE id=? AND subscription_id=? AND billing_generation=?",order.studio_id,resource,order.generation);
  }
 }
 return json({ok:true});
}
export async function billingRoutes(request,env,path,url) {
 if(path==='/api/plans' && request.method==='GET') return json({plans:catalog(env)});
 if(path==='/api/webhooks/mercadopago' && request.method==='POST') return processWebhook(request,env,url);
 if(path==='/api/billing' && request.method==='GET') {
  const u=await session(request,env); if(!u.studio) fail(400,'Selecione uma conviteira.');
  return json({studio:u.studio,orders:await all(env,'SELECT * FROM billing_orders WHERE studio_id=? ORDER BY created_at DESC LIMIT 100',u.studio_id),ledger:await all(env,'SELECT * FROM credit_ledger WHERE studio_id=? ORDER BY created_at DESC LIMIT 100',u.studio_id)});
 }
 if(path==='/api/billing/checkout' && request.method==='POST') {
  const u=await session(request,env); owner(u); if(!u.studio) fail(400,'Selecione uma conviteira.');
  if(!env.MP_ACCESS_TOKEN||!env.MP_WEBHOOK_SECRET||!env.MP_COLLECTOR_ID) fail(503,'Pagamentos ainda não configurados.');
  const b=await body(request),plan=catalog(env).find(p=>p.key===b.plan); if(!plan || !Number.isInteger(plan.amount_cents)||plan.amount_cents<=0) fail(400,'Plano ainda não disponível.');
  const testMode=mpTestMode(env),payerEmail=testMode?String(b.test_payer_email||'').trim():u.email;
  if(testMode&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) fail(400,'Na homologação, informe o e-mail do comprador de teste do Mercado Pago.');
  // Reuse the pending checkout. Recover a failed creation with its stable order/idempotency key.
  let order=await one(env,'SELECT * FROM billing_orders WHERE studio_id=? AND generation=? AND kind=? AND quantity=? AND status=? ORDER BY created_at DESC LIMIT 1',u.studio_id,u.studio.billing_generation,plan.kind,plan.quantity,'pending');
  if(plan.kind==='monthly' && u.studio.billing_mode==='monthly' && u.studio.subscription_id && !order) fail(409,'Sua assinatura já existe. Cancele antes de contratar outra.');
  if(!order) {
   const switching=u.studio.billing_mode!==plan.kind;
   // Cancel the remote recurring charge before committing a switch away from monthly.
   if(switching && u.studio.subscription_id) await mp(env,`/preapproval/${u.studio.subscription_id}`,'PUT',{status:'cancelled'});
   const orderId=id(),gen=u.studio.billing_generation+(switching || plan.kind==='monthly'?1:0);
   const results=await env.DB.batch([
    stmt(env,'UPDATE studios SET billing_mode=?,billing_generation=?,subscription_id=CASE WHEN ? THEN NULL ELSE subscription_id END,monthly_until=CASE WHEN ? THEN NULL ELSE monthly_until END WHERE id=? AND billing_generation=?',plan.kind,gen,switching?1:0,switching?1:0,u.studio_id,u.studio.billing_generation),
    stmt(env,'INSERT INTO billing_orders(id,studio_id,generation,kind,quantity,amount_cents,status,provider_id,checkout_url,created_at) SELECT ?,id,billing_generation,?,?,?,\'pending\',NULL,NULL,? FROM studios WHERE id=? AND billing_generation=? AND changes()=1',orderId,plan.kind,plan.quantity,plan.amount_cents,now(),u.studio_id,gen)
   ]);
   if(!results[0].meta.changes || !results[1].meta.changes) fail(409,'Seu plano foi alterado. Atualize a página.');
   order=await one(env,'SELECT * FROM billing_orders WHERE id=?',orderId);
  }
  if(order.checkout_url) return json({checkout_url:order.checkout_url,order_id:order.id});
  const notification=`${env.APP_ORIGIN}/api/webhooks/mercadopago`;
  const payload=plan.kind==='credits'?{
   items:[{id:plan.key,title:`${plan.quantity} crédito(s) Presença Confirmada`,quantity:1,currency_id:'BRL',unit_price:order.amount_cents/100}],payer:{email:payerEmail},external_reference:order.id,notification_url:notification,
   back_urls:{success:`${env.APP_ORIGIN}/app/financeiro`,pending:`${env.APP_ORIGIN}/app/financeiro`,failure:`${env.APP_ORIGIN}/app/financeiro`},auto_return:'approved'
  }:{reason:'Presença Confirmada · mensal',external_reference:order.id,payer_email:payerEmail,back_url:`${env.APP_ORIGIN}/app/financeiro`,notification_url:notification,
   auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:order.amount_cents/100,currency_id:'BRL'},status:'pending'};
  const checkoutKey=testMode?`${order.id}-${(await hash(payerEmail)).slice(0,16)}`:order.id;
  const result=await mp(env,plan.kind==='credits'?'/checkout/preferences':'/preapproval','POST',payload,checkoutKey);
  if(!result.id||!result.init_point) fail(502,'Checkout não retornou um endereço.');
  const checkout=new URL(result.init_point); if(checkout.protocol!=='https:'||!/(^|\.)mercadopago\.(com|com\.br)$/.test(checkout.hostname)) fail(502,'Endereço de checkout inválido.');
  const linked=await env.DB.batch([
   stmt(env,'UPDATE billing_orders SET provider_id=?,checkout_url=? WHERE id=?',String(result.id),result.init_point,order.id),
   ...(plan.kind==='monthly'?[stmt(env,"UPDATE studios SET subscription_id=? WHERE id=? AND billing_generation=? AND billing_mode='monthly'",String(result.id),u.studio_id,order.generation)]:[])
  ]);
  if(plan.kind==='monthly' && !linked[1].meta.changes) {
   await mp(env,`/preapproval/${encodeURIComponent(result.id)}`,'PUT',{status:'cancelled'});
   await run(env,"UPDATE billing_orders SET status='cancelled' WHERE id=?",order.id);
   fail(409,'A modalidade foi alterada durante o checkout. Atualize a página.');
  }
  await audit(env,u.studio_id,u.id,'checkout',{order_id:order.id,plan:plan.key});
  return json({checkout_url:result.init_point,order_id:order.id});
 }
 if(path==='/api/billing/cancel' && request.method==='POST') {
  const u=await session(request,env); owner(u); if(!u.studio) fail(400,'Selecione uma conviteira.');
  if(u.studio.subscription_id) await mp(env,`/preapproval/${u.studio.subscription_id}`,'PUT',{status:'cancelled'});
  await run(env,"UPDATE studios SET billing_mode='credits',billing_generation=billing_generation+1,subscription_id=NULL,monthly_until=NULL WHERE id=? AND billing_generation=?",u.studio_id,u.studio.billing_generation);
  await audit(env,u.studio_id,u.id,'cancel_subscription'); return json({ok:true});
 }
 return null;
}
