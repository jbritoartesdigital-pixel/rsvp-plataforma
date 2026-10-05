import {fail,now,id,token,hash,stmt,one,all,run,body,text,integer,audit,json} from './core.js';
import {session,admin,passwordHash} from './auth.js';
export async function adminRoutes(request,env,path) {
 if(!path.startsWith('/api/admin/')) return null;
 const u=await session(request,env); admin(u); const method=request.method;
 if(path==='/api/admin/studios' && method==='GET') return json({studios:await all(env,`SELECT s.*,
  (SELECT COUNT(*) FROM events e WHERE e.studio_id=s.id) event_count,
  (SELECT u.name FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner' ORDER BY u.created_at ASC LIMIT 1) owner_name,
  (SELECT u.email FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner' ORDER BY u.created_at ASC LIMIT 1) owner_email
  FROM studios s WHERE EXISTS(SELECT 1 FROM users x WHERE x.studio_id=s.id AND x.role='studio_owner') ORDER BY s.created_at DESC LIMIT 1000`)});
 if(path==='/api/admin/events' && method==='GET') return json({events:await all(env,"SELECT e.*,s.name studio_name,s.slug studio_slug FROM events e JOIN studios s ON s.id=e.studio_id WHERE EXISTS(SELECT 1 FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner') ORDER BY e.created_at DESC LIMIT 1000")});
 if(path==='/api/admin/financeiro' && method==='GET') return json({orders:await all(env,"SELECT o.*,s.name studio_name FROM billing_orders o JOIN studios s ON s.id=o.studio_id WHERE EXISTS(SELECT 1 FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner') ORDER BY o.created_at DESC LIMIT 1000"),payments:await all(env,"SELECT p.* FROM payments p JOIN billing_orders o ON o.id=p.order_id JOIN studios s ON s.id=o.studio_id WHERE EXISTS(SELECT 1 FROM users u WHERE u.studio_id=s.id AND u.role='studio_owner') ORDER BY p.updated_at DESC LIMIT 1000")});
 if(path==='/api/admin/audit' && method==='GET') return json({audit:await all(env,"SELECT a.* FROM audit_logs a WHERE a.studio_id IS NULL OR EXISTS(SELECT 1 FROM users u WHERE u.studio_id=a.studio_id AND u.role='studio_owner') ORDER BY a.created_at DESC LIMIT 1000")});
 if(path==='/api/admin/impersonate' && method==='POST') {
  const b=await body(request),studio=b.studio_id?await one(env,'SELECT id FROM studios WHERE id=?',text(b.studio_id,100)):null;
  if(b.studio_id&&!studio) fail(404,'Conviteira não encontrada.');
  await env.DB.batch([stmt(env,'UPDATE sessions SET impersonated_studio_id=? WHERE token_hash=?',studio?.id||null,u.token_hash),stmt(env,'INSERT INTO audit_logs(id,studio_id,actor_id,action,details,created_at,event_id,guest_id) VALUES(?,?,?,?,?,?,NULL,NULL)',id(),studio?.id||null,u.id,'impersonate',JSON.stringify({studio_id:studio?.id||null}),now())]); return json({ok:true});
 }
 let match=path.match(/^\/api\/admin\/studios\/([^/]+)(?:\/(credits|reset-link))?$/);
 if(match) {
  const studio=await one(env,'SELECT * FROM studios WHERE id=?',match[1]); if(!studio) fail(404,'Conviteira não encontrada.');
  if(!match[2] && method==='GET') return json({studio,users:await all(env,'SELECT id,name,email,role FROM users WHERE studio_id=?',studio.id),events:await all(env,'SELECT * FROM events WHERE studio_id=?',studio.id)});
  if(!match[2] && method==='PATCH') {
   const b=await body(request); if(!['active','suspended'].includes(b.status)) fail(400,'Status inválido.');
   await env.DB.batch([stmt(env,'UPDATE studios SET status=? WHERE id=?',b.status,studio.id),stmt(env,'INSERT INTO audit_logs(id,studio_id,actor_id,action,details,created_at,event_id,guest_id) VALUES(?,?,?,?,?,?,NULL,NULL)',id(),studio.id,u.id,'studio_status',JSON.stringify({status:b.status}),now())]); return json({ok:true});
  }
  if(match[2]==='credits' && method==='POST') {
   const b=await body(request),delta=integer(b.delta,-10000,10000),reason=text(b.reason,300);
   // Explicit adjustment always has an audit entry in the same transaction.
   await env.DB.batch([stmt(env,'INSERT INTO credit_ledger VALUES(?,?,?,?,?,?)',id(),studio.id,delta,reason,`admin:${id()}`,now()),stmt(env,'INSERT INTO audit_logs(id,studio_id,actor_id,action,details,created_at,event_id,guest_id) VALUES(?,?,?,?,?,?,NULL,NULL)',id(),studio.id,u.id,'credit_adjustment',JSON.stringify({delta,reason}),now())]); return json({ok:true});
  }
  if(match[2]==='reset-link' && method==='POST') {
   const user=await one(env,"SELECT id FROM users WHERE studio_id=? AND role='studio_owner'",studio.id),raw=token();
   if(!user) fail(404,'Responsável não encontrada.');
   await run(env,'INSERT INTO auth_challenges VALUES(?,?,?,?,?)',id(),user.id,'reset',await hash(raw),new Date(Date.now()+1800000).toISOString());
   await audit(env,studio.id,u.id,'issue_reset_link'); return json({url:`${env.APP_ORIGIN}/app/reset?token=${raw}`});
  }
 }
 return null;
}
