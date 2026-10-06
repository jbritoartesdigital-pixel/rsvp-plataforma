import {fail,now,id,token,hash,stmt,one,all,run,body,text,integer,audit,json} from './core.js';
import {session,admin} from './auth.js';
import {recomputeMonthly,mp} from './billing.js';

const monthBounds=(offset=0)=>{
 const d=new Date(),start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset,1)),end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset+1,1));
 return [start.toISOString(),end.toISOString()];
};
const moneyNumber=value=>Number(value||0);
const categoryLabel=value=>({paying:'pagante',courtesy:'cortesia',partner:'parceira',test:'teste',other:'não classificada'}[value]||'não classificada');

async function financeOverview(env){
 const [monthStart,monthEnd]=monthBounds(0),[prevStart,prevEnd]=monthBounds(-1),stamp=now();
 const approved=await all(env,`SELECT p.amount_cents,p.updated_at,o.kind,o.studio_id,o.id order_id
  FROM payments p JOIN billing_orders o ON o.id=p.order_id
  WHERE p.status='approved' AND p.updated_at>=? AND p.updated_at<?`,monthStart,monthEnd);
 const previous=await all(env,`SELECT p.amount_cents,p.updated_at,o.kind,o.studio_id
  FROM payments p JOIN billing_orders o ON o.id=p.order_id
  WHERE p.status='approved' AND p.updated_at>=? AND p.updated_at<?`,prevStart,prevEnd);
 const reversals=await all(env,`SELECT p.amount_cents,p.status,p.updated_at,o.studio_id,o.kind,o.id order_id
  FROM payments p JOIN billing_orders o ON o.id=p.order_id
  WHERE p.status IN ('refunded','charged_back') AND p.updated_at>=? AND p.updated_at<?`,monthStart,monthEnd);
 const activeMonthly=await one(env,`SELECT COUNT(*) n FROM studios s
  WHERE s.status='active' AND s.billing_mode='monthly' AND s.subscription_id IS NOT NULL AND s.monthly_until>?`,stamp);
 const paying=await one(env,`SELECT COUNT(*) n FROM studios s WHERE EXISTS(
  SELECT 1 FROM billing_orders o JOIN payments p ON p.order_id=o.id WHERE o.studio_id=s.id AND p.status='approved'
 ) OR (s.billing_mode='monthly' AND s.monthly_until>?)`,stamp);
 const newSubs=await one(env,`SELECT COUNT(*) n FROM billing_orders o
  WHERE o.kind='monthly' AND o.status IN ('approved','authorized') AND o.created_at>=? AND o.created_at<?`,monthStart,monthEnd);
 const cancellations=await one(env,`SELECT COUNT(*) n FROM audit_logs
  WHERE action IN ('cancel_subscription','subscription_cancelled') AND created_at>=? AND created_at<?`,monthStart,monthEnd);
 const renewals=await one(env,`SELECT COUNT(*) n FROM subscription_invoices i
  WHERE i.status='approved' AND i.updated_at>=? AND i.updated_at<?
   AND EXISTS(SELECT 1 FROM subscription_invoices earlier WHERE earlier.order_id=i.order_id AND earlier.status='approved' AND earlier.updated_at<i.updated_at)`,monthStart,monthEnd);
 const revenue=approved.reduce((n,x)=>n+moneyNumber(x.amount_cents),0),previousRevenue=previous.reduce((n,x)=>n+moneyNumber(x.amount_cents),0);
 const creditRevenue=approved.filter(x=>x.kind==='credits').reduce((n,x)=>n+moneyNumber(x.amount_cents),0);
 const subscriptionRevenue=approved.filter(x=>x.kind==='monthly').reduce((n,x)=>n+moneyNumber(x.amount_cents),0);
 const monthlyPrice=Number(env.MONTHLY_CENTS)||2990,activeSubscriptions=Number(activeMonthly?.n||0);
 const evolution=[];
 for(let offset=-5;offset<=0;offset++){
  const [start,end]=monthBounds(offset),row=await one(env,`SELECT COALESCE(SUM(p.amount_cents),0) amount,COUNT(*) payments
   FROM subscription_invoices i JOIN payments p ON p.id=i.payment_id
   WHERE i.status='approved' AND p.status='approved' AND p.updated_at>=? AND p.updated_at<?`,start,end);
  evolution.push({month:start.slice(0,7),amount_cents:Number(row?.amount||0),payments:Number(row?.payments||0)});
 }
 return {
  month:{revenue_cents:revenue,previous_revenue_cents:previousRevenue,change_percent:previousRevenue?Math.round((revenue-previousRevenue)/previousRevenue*1000)/10:null,
   credit_sales_cents:creditRevenue,subscription_sales_cents:subscriptionRevenue,approved_payments:approved.length,
   average_ticket_cents:approved.length?Math.round(revenue/approved.length):0,refunds_cents:reversals.reduce((n,x)=>n+moneyNumber(x.amount_cents),0),refunds_count:reversals.length},
  recurring:{mrr_cents:activeSubscriptions*monthlyPrice,active_subscriptions:activeSubscriptions,new_subscriptions:Number(newSubs?.n||0),
   cancellations:Number(cancellations?.n||0),renewals:Number(renewals?.n||0),evolution},
  paying_accounts:Number(paying?.n||0),
  note:'Receita usa pagamentos atualmente registrados como aprovados e o timestamp financeiro disponível no banco. Estornos aparecem separadamente.'
 };
}

async function usageOverview(env){
 const thirty=new Date(Date.now()-30*86400000).toISOString();
 const accounts=await one(env,`SELECT COUNT(*) n FROM studios s WHERE s.status='active' AND EXISTS(
  SELECT 1 FROM audit_logs a WHERE a.studio_id=s.id AND a.created_at>=?
  UNION SELECT 1 FROM events e WHERE e.studio_id=s.id AND e.created_at>=?
 )`,thirty,thirty);
 const studios=await one(env,"SELECT COUNT(*) n FROM studios s WHERE EXISTS(SELECT 1 FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner')");
 const events=await one(env,'SELECT COUNT(*) n FROM events');
 const month=monthBounds(0),created=await one(env,'SELECT COUNT(*) n FROM events WHERE created_at>=? AND created_at<?',...month);
 const guests=await one(env,'SELECT COUNT(*) n FROM guests WHERE deleted_at IS NULL');
 const modes=await all(env,'SELECT rsvp_mode,COUNT(*) n FROM events GROUP BY rsvp_mode');
 const features={
  flexible_list:Number((await one(env,"SELECT COUNT(*) n FROM events WHERE rsvp_mode='list' AND list_behavior='flexible'"))?.n||0),
  qr_checkin:Number((await one(env,"SELECT COUNT(*) n FROM events WHERE checkin_mode<>'off'"))?.n||0),
  messages:Number((await one(env,"SELECT COUNT(*) n FROM guests WHERE deleted_at IS NULL AND TRIM(message)<>''"))?.n||0),
  custom_media:Number((await one(env,"SELECT COUNT(DISTINCT event_id) n FROM event_media WHERE deleted_at IS NULL"))?.n||0),
  client_panel_actions:Number((await one(env,"SELECT COUNT(DISTINCT event_id) n FROM audit_logs WHERE event_id IS NOT NULL AND (action LIKE 'client_%' OR details LIKE '%\"source\":\"client\"%')"))?.n||0)
 };
 return {
  active_accounts_30d:Number(accounts?.n||0),events_created_month:Number(created?.n||0),
  average_events_per_studio:Number(studios?.n||0)?Math.round(Number(events?.n||0)/Number(studios.n)*10)/10:0,
  average_guests_per_event:Number(events?.n||0)?Math.round(Number(guests?.n||0)/Number(events.n)*10)/10:0,
  rsvp:Object.fromEntries(modes.map(x=>[x.rsvp_mode,Number(x.n)])),features
 };
}

async function exceptionsOverview(env){
 const stamp=now(),dayAgo=new Date(Date.now()-24*3600000).toISOString(),weekAgo=new Date(Date.now()-7*86400000).toISOString(),monthAgo=new Date(Date.now()-30*86400000).toISOString();
 const items=[];
 const missingCredits=await all(env,`SELECT o.id,o.studio_id,s.name,p.id payment_id,o.quantity FROM billing_orders o
  JOIN studios s ON s.id=o.studio_id JOIN payments p ON p.order_id=o.id AND p.status='approved'
  WHERE o.kind='credits' AND NOT EXISTS(SELECT 1 FROM credit_ledger l WHERE l.source_key='order:'||o.id) LIMIT 50`);
 for(const x of missingCredits)items.push({type:'credit_missing',severity:'error',studio_id:x.studio_id,title:'Pagamento aprovado sem crédito liberado',detail:`${x.name}: compra de ${x.quantity} crédito(s).`,order_id:x.id});
 const duplicatePayments=await all(env,`SELECT o.id,o.studio_id,s.name,COUNT(*) n FROM billing_orders o JOIN studios s ON s.id=o.studio_id
  JOIN payments p ON p.order_id=o.id AND p.status='approved' WHERE o.kind='credits' GROUP BY o.id HAVING COUNT(*)>1 LIMIT 50`);
 for(const x of duplicatePayments)items.push({type:'duplicate_payment',severity:'error',studio_id:x.studio_id,title:'Possível cobrança duplicada',detail:`${x.name}: ${x.n} pagamentos aprovados para a mesma compra.`,order_id:x.id});
 const monthlyBroken=await all(env,`SELECT DISTINCT o.id,o.studio_id,s.name,i.period_end FROM subscription_invoices i
  JOIN billing_orders o ON o.id=i.order_id JOIN studios s ON s.id=o.studio_id JOIN payments p ON p.id=i.payment_id
  WHERE i.status='approved' AND p.status='approved' AND i.period_end>? AND (s.billing_mode<>'monthly' OR s.monthly_until IS NULL OR s.monthly_until<?)
  LIMIT 50`,stamp,stamp);
 for(const x of monthlyBroken)items.push({type:'subscription_inconsistent',severity:'error',studio_id:x.studio_id,title:'Mensalidade paga sem acesso ativo',detail:`${x.name}: há período pago vigente sem entitlement correspondente.`,order_id:x.id});
 const stuck=await all(env,`SELECT p.id,o.id order_id,o.studio_id,s.name,p.status,p.updated_at FROM payments p JOIN billing_orders o ON o.id=p.order_id JOIN studios s ON s.id=o.studio_id
  WHERE p.status IN ('pending','in_process','authorized','in_mediation') AND p.updated_at<? LIMIT 50`,dayAgo);
 for(const x of stuck)items.push({type:'payment_stuck',severity:'attention',studio_id:x.studio_id,title:'Pagamento parado em processamento',detail:`${x.name}: estado ${x.status} há mais de 24 horas.`,order_id:x.order_id});
 const reversals=await all(env,`SELECT p.id,o.id order_id,o.studio_id,s.name,p.status,p.updated_at FROM payments p JOIN billing_orders o ON o.id=p.order_id JOIN studios s ON s.id=o.studio_id
  WHERE p.status IN ('refunded','charged_back') AND p.updated_at>=? ORDER BY p.updated_at DESC LIMIT 50`,monthAgo);
 for(const x of reversals)items.push({type:x.status,severity:x.status==='charged_back'?'error':'attention',studio_id:x.studio_id,title:x.status==='charged_back'?'Chargeback recebido':'Pagamento estornado',detail:`${x.name}: revisar impacto da cobrança.`,order_id:x.order_id});
 const integrations=await all(env,`SELECT x.* FROM integration_events x WHERE x.status='error' AND x.created_at>=?
  AND NOT EXISTS(SELECT 1 FROM integration_events ok WHERE ok.provider=x.provider AND ok.kind=x.kind AND COALESCE(ok.external_id,'')=COALESCE(x.external_id,'') AND ok.status='ok' AND ok.created_at>x.created_at)
  ORDER BY x.created_at DESC LIMIT 50`,weekAgo);
 for(const x of integrations)items.push({type:'integration',severity:'error',studio_id:x.studio_id,title:x.provider==='resend'?'Falha no envio de e-mail':'Falha de integração',detail:x.message||`${x.provider}: ${x.kind}`,integration_id:x.id});
 const negative=await all(env,"SELECT id studio_id,name,credits FROM studios WHERE credits<0 LIMIT 50");
 for(const x of negative)items.push({type:'negative_credits',severity:'error',studio_id:x.studio_id,title:'Saldo de créditos negativo',detail:`${x.name}: saldo ${x.credits}.`});
 return items.slice(0,100);
}

async function healthOverview(env,request){
 const services=[];
 const push=(key,label,state,message)=>services.push({key,label,state,message});
 push('app','Aplicação','operational','A área administrativa respondeu normalmente.');
 try{await one(env,'SELECT 1 ok');push('d1','D1','operational','Banco de dados respondeu.');}catch{push('d1','D1','error','O banco de dados não respondeu à verificação.');}
 try{
  if(typeof env.MEDIA?.list==='function'){await env.MEDIA.list({limit:1});push('r2','R2','operational','Armazenamento de mídias respondeu.');}
  else push('r2','R2','attention','Binding de mídia presente, mas a verificação profunda não está disponível neste ambiente.');
 }catch{push('r2','R2','error','O armazenamento de mídias não respondeu.');}
 try{await mp(env,'/users/me');push('mercadopago','Mercado Pago','operational','Credencial e API responderam.');}
 catch{push('mercadopago','Mercado Pago','error','Não foi possível validar a comunicação com o Mercado Pago.');}
 const mpRecent=await one(env,"SELECT status,message,created_at FROM integration_events WHERE provider='mercadopago' ORDER BY created_at DESC LIMIT 1"),
  anyPayment=await one(env,"SELECT 1 ok FROM payments LIMIT 1");
 if(!env.MP_WEBHOOK_SECRET)push('mp_webhooks','Webhooks do Mercado Pago','attention','Webhook ainda não está completamente configurado no Worker.');
 else if(mpRecent)push('mp_webhooks','Webhooks do Mercado Pago',mpRecent.status==='error'?'error':'operational',mpRecent.status==='error'?(mpRecent.message||'A última entrega registrada falhou.'):'A última entrega registrada foi processada.');
 else if(!anyPayment)push('mp_webhooks','Webhooks do Mercado Pago','operational','Webhook configurado. Ainda não houve pagamento real para exercitar esse fluxo.');
 else push('mp_webhooks','Webhooks do Mercado Pago','attention','Há pagamento registrado, mas ainda não há entrega de webhook registrada para confirmar o fluxo.');
 const resendConfigured=!!(env.MAILER_URL&&env.MAILER_FROM&&env.MAILER_TOKEN),mailRecent=await one(env,"SELECT status,message,created_at FROM integration_events WHERE provider='resend' ORDER BY created_at DESC LIMIT 1");
 if(!resendConfigured)push('resend','Resend','attention','Envio de recuperação ainda não está completamente configurado no Worker.');
 else if(mailRecent?.status==='error')push('resend','Resend','error',mailRecent.message||'O último envio registrado falhou.');
 else if(mailRecent?.status==='ok')push('resend','Resend','operational','Configuração presente e há envio concluído registrado.');
 else push('resend','Resend','attention','Configuração presente, mas ainda não há envio real concluído registrado.');

 let requestOrigin='';
 try{requestOrigin=new URL(request.url).origin;}catch{}
 if(requestOrigin===String(env.APP_ORIGIN||''))push('domain','Domínio principal','operational','Você está acessando o painel pelo domínio principal e esta verificação respondeu normalmente.');
 else push('domain','Domínio principal','attention','O painel respondeu, mas esta chamada não veio pelo domínio principal configurado.');

 const studio=await one(env,"SELECT slug FROM studios WHERE status='active' ORDER BY created_at LIMIT 1"),
  wildcardSmoke=await one(env,"SELECT status,message,created_at FROM integration_events WHERE provider='platform' AND kind='wildcard_smoke' ORDER BY created_at DESC LIMIT 1");
 if(!studio)push('wildcard','Wildcard das conviteiras','attention','Não há conviteira ativa para validar o wildcard.');
 else if(wildcardSmoke?.status==='error')push('wildcard','Wildcard das conviteiras','error',wildcardSmoke.message||'O último smoke externo do wildcard falhou.');
 else if(wildcardSmoke?.status==='ok')push('wildcard','Wildcard das conviteiras','operational',wildcardSmoke.message||'Wildcard validado externamente no último deploy.');
 else push('wildcard','Wildcard das conviteiras','attention','Wildcard configurado, mas ainda não há smoke externo registrado neste ambiente.');
 return services;
}

async function studio360(env,studioId){
 const studio=await one(env,`SELECT s.*,
  CASE WHEN s.status='suspended' THEN 'suspended'
   WHEN s.commercial_category<>'other' THEN s.commercial_category
   WHEN EXISTS(SELECT 1 FROM billing_orders o JOIN payments p ON p.order_id=o.id WHERE o.studio_id=s.id AND p.status='approved') THEN 'paying'
   ELSE 'other' END display_category
  FROM studios s WHERE s.id=?`,studioId);
 if(!studio)fail(404,'Conviteira não encontrada.');
 const users=await all(env,'SELECT id,name,email,role,created_at FROM users WHERE studio_id=? ORDER BY created_at',studioId);
 const events=await all(env,`SELECT id,title,slug,event_date,status,rsvp_mode,checkin_mode,created_at,
  (SELECT COUNT(*) FROM guests g WHERE g.event_id=events.id AND g.deleted_at IS NULL) guest_count
  FROM events WHERE studio_id=? ORDER BY created_at DESC LIMIT 200`,studioId);
 const orders=await all(env,'SELECT * FROM billing_orders WHERE studio_id=? ORDER BY created_at DESC LIMIT 100',studioId);
 const payments=await all(env,'SELECT p.* FROM payments p JOIN billing_orders o ON o.id=p.order_id WHERE o.studio_id=? ORDER BY p.updated_at DESC LIMIT 100',studioId);
 const ledger=await all(env,'SELECT * FROM credit_ledger WHERE studio_id=? ORDER BY created_at DESC LIMIT 100',studioId);
 const auditRows=await all(env,'SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.studio_id=? ORDER BY a.created_at DESC LIMIT 150',studioId);
 return {studio:{...studio,category_label:studio.display_category==='suspended'?'suspensa':categoryLabel(studio.display_category)},users,events,orders,payments,ledger,audit:auditRows,
  summary:{events:events.length,active_events:events.filter(x=>x.status==='active').length,archived_events:events.filter(x=>x.status==='archived').length},
  last_access:null,last_access_note:'O sistema atual não registra login com timestamp confiável; por segurança, nenhum horário é estimado.'};
}

export async function adminRoutes(request,env,path) {
 if(!path.startsWith('/api/admin/')) return null;
 const u=await session(request,env); admin(u); const method=request.method;

 if(path==='/api/admin/overview'&&method==='GET')return json({finance:await financeOverview(env),usage:await usageOverview(env),exceptions:await exceptionsOverview(env)});
 if(path==='/api/admin/health'&&method==='GET')return json({services:await healthOverview(env,request)});
 if(path==='/api/admin/exceptions'&&method==='GET')return json({exceptions:await exceptionsOverview(env)});
 if(path==='/api/admin/studios' && method==='GET') return json({studios:await all(env,`SELECT s.*,
  (SELECT COUNT(*) FROM events e WHERE e.studio_id=s.id) event_count,
  (SELECT COUNT(*) FROM events e WHERE e.studio_id=s.id AND e.status='active') active_event_count,
  (SELECT COUNT(*) FROM events e WHERE e.studio_id=s.id AND e.status='archived') archived_event_count,
  (SELECT u.name FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner' ORDER BY u.created_at ASC LIMIT 1) owner_name,
  (SELECT u.email FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner' ORDER BY u.created_at ASC LIMIT 1) owner_email,
  CASE WHEN s.status='suspended' THEN 'suspended'
   WHEN s.commercial_category<>'other' THEN s.commercial_category
   WHEN EXISTS(SELECT 1 FROM billing_orders o JOIN payments p ON p.order_id=o.id WHERE o.studio_id=s.id AND p.status='approved') THEN 'paying'
   ELSE 'other' END display_category
  FROM studios s WHERE EXISTS(SELECT 1 FROM users x WHERE x.studio_id=s.id AND x.role='studio_owner') ORDER BY s.created_at DESC LIMIT 1000`)});
 if(path==='/api/admin/events' && method==='GET') return json({events:await all(env,"SELECT e.*,s.name studio_name,s.slug studio_slug FROM events e JOIN studios s ON s.id=e.studio_id WHERE EXISTS(SELECT 1 FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner') ORDER BY e.created_at DESC LIMIT 1000")});
 if(path==='/api/admin/financeiro' && method==='GET') return json({summary:await financeOverview(env),orders:await all(env,"SELECT o.*,s.name studio_name FROM billing_orders o JOIN studios s ON s.id=o.studio_id WHERE EXISTS(SELECT 1 FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner') ORDER BY o.created_at DESC LIMIT 1000"),payments:await all(env,"SELECT p.*,o.studio_id,s.name studio_name,o.kind FROM payments p JOIN billing_orders o ON o.id=p.order_id JOIN studios s ON s.id=o.studio_id WHERE EXISTS(SELECT 1 FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner') ORDER BY p.updated_at DESC LIMIT 1000")});
 if(path==='/api/admin/audit' && method==='GET') return json({audit:await all(env,"SELECT a.*,s.name studio_name,u.name actor_name FROM audit_logs a LEFT JOIN studios s ON s.id=a.studio_id LEFT JOIN users u ON u.id=a.actor_id WHERE a.studio_id IS NULL OR EXISTS(SELECT 1 FROM users x WHERE x.studio_id=a.studio_id AND x.role='studio_owner') ORDER BY a.created_at DESC LIMIT 1000")});
 if(path==='/api/admin/impersonate' && method==='POST') {
  const b=await body(request),target=b.studio_id?await one(env,'SELECT id,name FROM studios WHERE id=?',text(b.studio_id,100)):null;
  if(b.studio_id&&!target) fail(404,'Conviteira não encontrada.');
  const old=u.impersonated_studio_id||null,action=target?'support_mode_enter':'support_mode_exit',auditStudio=target?.id||old;
  await env.DB.batch([
   stmt(env,'UPDATE sessions SET impersonated_studio_id=? WHERE token_hash=?',target?.id||null,u.token_hash),
   stmt(env,'INSERT INTO audit_logs(id,studio_id,actor_id,action,details,created_at,event_id,guest_id) VALUES(?,?,?,?,?,?,NULL,NULL)',id(),auditStudio,u.id,action,JSON.stringify({studio_id:auditStudio}),now())
  ]); return json({ok:true});
 }
 let match=path.match(/^\/api\/admin\/studios\/([^/]+)(?:\/(credits|reset-link|reconcile))?$/);
 if(match) {
  const studio=await one(env,'SELECT * FROM studios WHERE id=?',match[1]); if(!studio) fail(404,'Conviteira não encontrada.');
  if(!match[2] && method==='GET') return json(await studio360(env,studio.id));
  if(!match[2] && method==='PATCH') {
   const b=await body(request),queries=[],changes={};
   if(b.status!==undefined){
    if(!['active','suspended'].includes(b.status))fail(400,'Status inválido.');
    if(b.status!==studio.status){queries.push(stmt(env,'UPDATE studios SET status=? WHERE id=?',b.status,studio.id));changes.status=b.status;queries.push(stmt(env,'INSERT INTO audit_logs(id,studio_id,actor_id,action,details,created_at,event_id,guest_id) VALUES(?,?,?,?,?,?,NULL,NULL)',id(),studio.id,u.id,b.status==='suspended'?'studio_suspended':'studio_reactivated',JSON.stringify({from:studio.status,to:b.status}),now()));}
   }
   if(b.commercial_category!==undefined){
    const category=text(b.commercial_category,30);if(!['paying','courtesy','partner','test','other'].includes(category))fail(400,'Classificação inválida.');
    if(category!==studio.commercial_category){queries.push(stmt(env,'UPDATE studios SET commercial_category=? WHERE id=?',category,studio.id));changes.commercial_category=category;queries.push(stmt(env,'INSERT INTO audit_logs(id,studio_id,actor_id,action,details,created_at,event_id,guest_id) VALUES(?,?,?,?,?,?,NULL,NULL)',id(),studio.id,u.id,'commercial_category_changed',JSON.stringify({from:studio.commercial_category,to:category}),now()));}
   }
   if(!queries.length)return json({ok:true,unchanged:true});
   await env.DB.batch(queries);return json({ok:true,changes});
  }
  if(match[2]==='credits' && method==='POST') {
   const b=await body(request),delta=integer(b.delta,-10000,10000),reason=text(b.reason,300);if(delta===0)fail(400,'Informe um ajuste diferente de zero.');
   const source=`admin:${id()}`;
   await env.DB.batch([
    stmt(env,'INSERT INTO credit_ledger VALUES(?,?,?,?,?,?)',id(),studio.id,delta,reason,source,now()),
    stmt(env,'INSERT INTO audit_logs(id,studio_id,actor_id,action,details,created_at,event_id,guest_id) VALUES(?,?,?,?,?,?,NULL,NULL)',id(),studio.id,u.id,'credit_adjustment',JSON.stringify({delta,reason}),now())
   ]); return json({ok:true});
  }
  if(match[2]==='reset-link' && method==='POST') {
   const target=await one(env,"SELECT id FROM users WHERE studio_id=? AND role='studio_owner' ORDER BY created_at LIMIT 1",studio.id),raw=token();
   if(!target) fail(404,'Responsável não encontrada.');
   await run(env,'INSERT INTO auth_challenges VALUES(?,?,?,?,?)',id(),target.id,'reset',await hash(raw),new Date(Date.now()+1800000).toISOString());
   await audit(env,studio.id,u.id,'issue_reset_link',{user_id:target.id}); return json({url:`${env.APP_ORIGIN}/app/reset?token=${raw}`});
  }
  if(match[2]==='reconcile'&&method==='POST'){
   const missing=await all(env,`SELECT o.* FROM billing_orders o JOIN payments p ON p.order_id=o.id AND p.status='approved'
    WHERE o.studio_id=? AND o.kind='credits' AND NOT EXISTS(SELECT 1 FROM credit_ledger l WHERE l.source_key='order:'||o.id)`,studio.id);
   let creditsFixed=0;
   for(const order of missing){
    const result=await run(env,`INSERT OR IGNORE INTO credit_ledger(id,studio_id,delta,reason,source_key,created_at) VALUES(?,?,?,?,?,?)`,id(),studio.id,Number(order.quantity),'purchase',`order:${order.id}`,now());
    creditsFixed+=Number(result.meta.changes||0);
   }
   const monthly=await one(env,"SELECT * FROM billing_orders WHERE studio_id=? AND kind='monthly' AND provider_id=? AND generation=? ORDER BY created_at DESC LIMIT 1",studio.id,studio.subscription_id,studio.billing_generation);
   if(monthly)await recomputeMonthly(env,monthly);
   await audit(env,studio.id,u.id,'admin_reconcile_billing',{credits_fixed:creditsFixed,monthly_recomputed:!!monthly});
   return json({ok:true,credits_fixed:creditsFixed,monthly_recomputed:!!monthly});
  }
 }
 return null;
}
