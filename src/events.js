import {fail,now,id,token,stmt,one,all,run,body,text,slug,choice,integer,date,safeObject,audit,json,limit} from './core.js';
import {session,owner} from './auth.js';
export async function tenantEvent(env,user,eventId) {
 if(!user.studio_id) fail(400,'Selecione uma conviteira.');
 const e=await one(env,'SELECT * FROM events WHERE id=? AND studio_id=?',eventId,user.studio_id); if(!e) fail(404,'Evento não encontrado.'); return e;
}
function publicEvent(e) {
 return {id:e.id,title:e.title,event_date:e.event_date,location:e.location,deadline:e.deadline,status:e.status,rsvp_mode:e.rsvp_mode,max_people:e.max_people,checkin_mode:e.checkin_mode,appearance:JSON.parse(e.appearance),welcome_message:e.welcome_message,studio_name:e.studio_name,brand:JSON.parse(e.brand||'{}')};
}
function accepting(e) { if(e.status!=='active'||e.studio_status==='suspended'||e.deadline && e.deadline<now()) fail(403,'Confirmações encerradas.'); }
async function guestData(env,g,privateView=false) {
 const members=await all(env,'SELECT id,name,person_type,attendance_status,qr_token FROM guest_members WHERE guest_id=?',g.id);
 return {id:g.id,name:g.name,response_status:g.response_status,max_people:g.max_people,message:g.message,dietary:g.dietary,token:g.token,qr_token:g.qr_token,members,...(privateView?{phone:g.phone}:{})};
}
async function saveRsvp(env,e,g,b,actor=null) {
 const status=choice(b.response_status,['yes','no','pending']);
 const members=Array.isArray(b.members)?b.members:[];
 if(members.length>Math.min(e.max_people,g.max_people)||!members.length) fail(400,'Informe as pessoas dentro do limite do convite.');
 const clean=members.map(m=>({id:m.id?text(m.id,100):id(),name:text(m.name),person_type:choice(m.person_type||'adult',['adult','child']),attendance_status:status==='yes'?choice(m.attendance_status||'yes',['yes','no','pending']):status}));
 if(new Set(clean.map(m=>m.id)).size!==clean.length) fail(400,'Pessoas duplicadas.');
 const old=await all(env,'SELECT * FROM guest_members WHERE guest_id=?',g.id),oldIds=new Set(old.map(m=>m.id));
 for(const m of clean) if(members.find(x=>x.id===m.id) && !oldIds.has(m.id)) fail(400,'Pessoa inválida.');
 const stamp=now(),queries=[stmt(env,"UPDATE guests SET name=?,phone=?,response_status=?,message=?,dietary=?,updated_at=?,qr_token=CASE WHEN ?='yes' AND (SELECT checkin_mode FROM events WHERE id=guests.event_id)='family' THEN CASE WHEN response_status='yes' AND qr_token IS NOT NULL THEN qr_token ELSE ? END ELSE NULL END WHERE id=? AND event_id=?",text(b.name||g.name),text(b.phone??g.phone,40,false),status,text(b.message??g.message,2000,false),text(b.dietary??g.dietary,500,false),stamp,status,token(),g.id,e.id)];
 const retained=clean.map(m=>m.id);
 for(const m of old) if(!retained.includes(m.id)) queries.push(stmt(env,'UPDATE guest_members SET attendance_status=\'no\',qr_token=NULL WHERE id=? AND guest_id=?',m.id,g.id));
 for(const m of clean) {
  const qr=m.attendance_status==='yes' && e.checkin_mode==='individual'?token():null;
  queries.push(stmt(env,`INSERT INTO guest_members SELECT ?,?,?,?,?,?,CASE WHEN (SELECT checkin_mode FROM events WHERE id=?)='individual' THEN ? ELSE NULL END ON CONFLICT(id) DO UPDATE SET name=excluded.name,person_type=excluded.person_type,attendance_status=excluded.attendance_status,qr_token=CASE WHEN excluded.qr_token IS NULL THEN NULL WHEN guest_members.attendance_status='yes' AND guest_members.qr_token IS NOT NULL THEN guest_members.qr_token ELSE excluded.qr_token END WHERE guest_members.guest_id=excluded.guest_id AND guest_members.event_id=excluded.event_id`,m.id,g.id,e.id,m.name,m.person_type,m.attendance_status,e.id,qr));
 }
 await env.DB.batch(queries); await audit(env,e.studio_id,actor,'rsvp',{event_id:e.id,guest_id:g.id,status});
 return guestData(env,await one(env,'SELECT * FROM guests WHERE id=?',g.id));
}
export async function eventsRoutes(request,env,path,url) {
 const method=request.method;
 let match=path.match(/^\/api\/public\/([^/]+)\/([^/]+)(?:\/(rsvp))?$/);
 if(match) {
  const e=await one(env,'SELECT e.*,s.name studio_name,s.brand,s.status studio_status FROM events e JOIN studios s ON s.id=e.studio_id WHERE s.slug=? AND e.slug=?',match[1],match[2]);
  if(!e || e.status!=='active'||e.studio_status!=='active') fail(404,'Evento indisponível.');
  if(!match[3] && method==='GET') {
   const g=url.searchParams.get('invite')?await one(env,'SELECT * FROM guests WHERE event_id=? AND token=?',e.id,url.searchParams.get('invite')):null;
   return json({event:publicEvent(e),guest:g?await guestData(env,g):null});
  }
  if(match[3] && method==='POST') {
   accepting(e); await limit(env,`rsvp:${e.id}:${request.headers.get('cf-connecting-ip')||'local'}`,30);
   const b=await body(request); let g=b.token?await one(env,'SELECT * FROM guests WHERE token=? AND event_id=?',String(b.token),e.id):null;
   if(b.token&&!g) fail(404,'Convite inválido.');
   if(!g) {
    if(e.rsvp_mode==='list') fail(403,'Abra o link individual enviado pelo anfitrião.');
    const created=now(); g={id:id(),event_id:e.id,name:text(b.name),phone:'',response_status:'pending',max_people:e.max_people,message:'',dietary:'',token:token(),qr_token:null,created_at:created,updated_at:created};
    // Validate before creating the guest to avoid empty orphan confirmations.
    choice(b.response_status,['yes','no','pending']); if(!Array.isArray(b.members)||!b.members.length||b.members.length>e.max_people) fail(400,'Informe as pessoas do convite.');
    await run(env,'INSERT INTO guests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',g.id,e.id,g.name,'','pending',e.max_people,'','',g.token,null,created,created);
   }
   return json({guest:await saveRsvp(env,e,g,b)});
  }
 }
 match=path.match(/^\/api\/q\/([^/]+)$/);
 if(match && method==='GET') {
  const qr=await validQR(env,match[1]); return json({name:qr.name,event_title:qr.title,token:match[1],checked_in:!!await one(env,'SELECT id FROM checkins WHERE subject_key=?',qr.subject)});
 }
 match=path.match(/^\/api\/cliente\/([^/]+)(?:\/guests(?:\/([^/]+))?)?$/);
 if(match) {
  const e=await one(env,'SELECT e.*,s.status studio_status FROM events e JOIN studios s ON s.id=e.studio_id WHERE client_token=?',match[1]);
  if(!e||e.studio_status!=='active') fail(404,'Link indisponível.'); const permissions=JSON.parse(e.client_permissions);
   if(method==='GET' && permissions.view) {
    const guests=await all(env,'SELECT * FROM guests WHERE event_id=? ORDER BY name',e.id);
    return json({event:publicEvent(e),permissions,guests:await Promise.all(guests.map(async g=>{const data=await guestData(env,g,true);delete data.token;delete data.qr_token;data.members=data.members.map(({qr_token,...m})=>m);return data;}))});
   }
  if(method==='PATCH' && match[2] && permissions.manage_guests) {
   const g=await one(env,'SELECT * FROM guests WHERE id=? AND event_id=?',match[2],e.id); if(!g) fail(404,'Convidado não encontrado.');
   const saved=await saveRsvp(env,e,g,await body(request)); delete saved.token; delete saved.qr_token; saved.members=saved.members.map(({qr_token,...m})=>m); return json({guest:saved});
  }
  fail(403,'Permissão não disponível nesse link.');
 }
 if(path==='/api/events') {
  const u=await session(request,env); if(!u.studio) fail(400,'Selecione uma conviteira.');
  if(method==='GET') return json({events:await all(env,'SELECT * FROM events WHERE studio_id=? ORDER BY created_at DESC LIMIT 500',u.studio_id)});
  if(method==='POST') {
   const b=await body(request),eventId=id();
   await run(env,'INSERT INTO events(id,studio_id,title,slug,event_date,location,deadline,rsvp_mode,max_people,checkin_mode,client_token,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',eventId,u.studio_id,text(b.title),slug(b.slug),date(b.event_date),text(b.location,300,false),date(b.deadline),choice(b.rsvp_mode||'free',['free','list']),integer(b.max_people||10,1,100),choice(b.checkin_mode||'off',['off','family','individual']),token(),now());
   await audit(env,u.studio_id,u.id,'create_event',{event_id:eventId}); return json({event:await tenantEvent(env,u,eventId)},201);
  }
 }
 match=path.match(/^\/api\/events\/([^/]+)(?:\/(guests|checkins|client-link|media)(?:\/([^/]+))?)?$/);
 if(match) {
  const u=await session(request,env),e=await tenantEvent(env,u,match[1]),sub=match[2],key=match[3];
  if(!sub && method==='GET') return json({event:e});
  if(!sub && method==='PATCH') {
   const b=await body(request);
   await run(env,'UPDATE events SET title=?,event_date=?,location=?,deadline=?,status=?,rsvp_mode=?,max_people=?,checkin_mode=?,appearance=?,welcome_message=? WHERE id=? AND studio_id=?',text(b.title??e.title),date(b.event_date??e.event_date),text(b.location??e.location,300,false),date(b.deadline===undefined?e.deadline:b.deadline),choice(b.status??e.status,['active','inactive','archived']),choice(b.rsvp_mode??e.rsvp_mode,['free','list']),integer(b.max_people??e.max_people,1,100),choice(b.checkin_mode??e.checkin_mode,['off','family','individual']),b.appearance?safeObject(b.appearance):e.appearance,text(b.welcome_message??e.welcome_message,2000,false),e.id,u.studio_id);
   await audit(env,u.studio_id,u.id,'update_event',{event_id:e.id}); return json({ok:true});
  }
  if(sub==='client-link' && method==='POST') {
   const b=await body(request),raw=token(); await run(env,'UPDATE events SET client_token=?,client_permissions=? WHERE id=? AND studio_id=?',raw,JSON.stringify({view:true,manage_guests:!!b.manage_guests}),e.id,u.studio_id); return json({url:`${env.APP_ORIGIN}/cliente/${raw}`});
  }
  if(sub==='guests') {
   if(method==='GET') {
    const guests=await all(env,'SELECT * FROM guests WHERE event_id=? ORDER BY name LIMIT 2000',e.id); return json({guests:await Promise.all(guests.map(g=>guestData(env,g,true)))});
   }
   if(method==='POST') {
    const b=await body(request),rows=b.guests||[b]; if(!Array.isArray(rows)||rows.length<1||rows.length>300) fail(400,'Importe até 300 convidados por vez.');
    const stamp=now(); await env.DB.batch(rows.map(g=>stmt(env,'INSERT INTO guests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id(),e.id,text(g.name),text(g.phone,40,false),'pending',integer(g.max_people||e.max_people,1,e.max_people),'','',token(),null,stamp,stamp)));
    await audit(env,u.studio_id,u.id,'add_guests',{event_id:e.id,count:rows.length}); return json({ok:true},201);
   }
   if(method==='PATCH' && key) {
    const g=await one(env,'SELECT * FROM guests WHERE id=? AND event_id=?',key,e.id); if(!g) fail(404,'Convidado não encontrado.'); return json({guest:await saveRsvp(env,e,g,await body(request),u.id)});
   }
   if(method==='DELETE' && key) {
    // Soft cancellation keeps check-in history intact, while the trigger invalidates all QR tokens.
    await run(env,"UPDATE guests SET response_status='no',qr_token=NULL,updated_at=? WHERE id=? AND event_id=?",now(),key,e.id); return json({ok:true});
   }
  }
  if(sub==='checkins') {
   if(method==='GET') return json({checkins:await all(env,'SELECT c.*,COALESCE(m.name,g.name) name FROM checkins c JOIN guests g ON g.id=c.guest_id LEFT JOIN guest_members m ON m.id=c.member_id AND m.guest_id=g.id WHERE c.event_id=? ORDER BY c.created_at DESC',e.id)});
   if(method==='POST') {
    const b=await body(request); let raw=b.token;
    if(!raw && b.guest_id) {
     const g=await one(env,"SELECT * FROM guests WHERE id=? AND event_id=? AND response_status='yes'",String(b.guest_id),e.id); if(!g) fail(403,'Presença não confirmada.');
     raw=e.checkin_mode==='family'?g.qr_token:(await one(env,"SELECT qr_token FROM guest_members WHERE id=? AND guest_id=? AND attendance_status='yes'",String(b.member_id||''),g.id))?.qr_token;
    }
    const qr=await validQR(env,String(raw||'')); if(qr.event_id!==e.id) fail(403,'QR pertence a outro evento.');
    // Revalidate with INSERT SELECT so a simultaneous cancellation cannot pass a stale lookup.
    const inserted=await run(env,`INSERT OR IGNORE INTO checkins SELECT ?,e.id,g.id,?,?,?, ?,? FROM guests g JOIN events e ON e.id=g.event_id JOIN studios s ON s.id=e.studio_id WHERE g.id=? AND e.id=? AND e.studio_id=? AND s.status='active' AND e.status='active' AND g.response_status='yes' AND ((e.checkin_mode='family' AND g.qr_token=?) OR (e.checkin_mode='individual' AND EXISTS(SELECT 1 FROM guest_members m WHERE m.id=? AND m.guest_id=g.id AND m.attendance_status='yes' AND m.qr_token=?)))`,id(),qr.member_id,qr.subject,raw,u.id,now(),qr.guest_id,e.id,u.studio_id,raw,qr.member_id,raw);
    const existing=await one(env,'SELECT * FROM checkins WHERE subject_key=?',qr.subject);
    if(!existing) fail(409,'QR invalidado.');
    return json({ok:true,already_checked_in:!inserted.meta.changes,checkin:existing});
   }
  }
  if(sub==='media' && method==='POST') {
   const mime=request.headers.get('content-type')?.split(';')[0]; if(!['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm'].includes(mime)) fail(400,'Tipo de mídia inválido.');
   const bytes=await request.arrayBuffer(); if(bytes.byteLength>20*1024*1024||!bytes.byteLength) fail(413,'Arquivo deve ter até 20 MB.');
   const mediaId=id(),object=`${u.studio_id}/${e.id}/${mediaId}`;
   await env.MEDIA.put(object,bytes,{httpMetadata:{contentType:mime}});
   try { await run(env,'INSERT INTO event_media VALUES(?,?,?,?,?,?,?)',mediaId,e.id,u.studio_id,object,mime,bytes.byteLength,now()); }
   catch(error) { await env.MEDIA.delete(object); throw error; }
   return json({url:`/media/${mediaId}`},201);
  }
 }
 if(path==='/api/brand') {
  const u=await session(request,env); if(!u.studio) fail(400,'Selecione uma conviteira.');
  if(method==='GET') return json({studio:u.studio});
  if(method==='PATCH') { owner(u); const b=await body(request); await run(env,'UPDATE studios SET name=?,whatsapp=?,brand=? WHERE id=?',text(b.name??u.studio.name),text(b.whatsapp??u.studio.whatsapp,40),safeObject(b.brand||{}),u.studio_id); return json({ok:true}); }
 }
 return null;
}
export async function validQR(env,raw) {
 const g=await one(env,`SELECT g.id guest_id,g.name,g.event_id,e.title,e.checkin_mode,g.qr_token FROM guests g JOIN events e ON e.id=g.event_id JOIN studios s ON s.id=e.studio_id WHERE g.qr_token=? AND g.response_status='yes' AND e.checkin_mode='family' AND e.status='active' AND s.status='active'`,raw);
 if(g) return {...g,member_id:null,subject:`guest:${g.guest_id}`};
 const m=await one(env,`SELECT m.id member_id,m.name,g.id guest_id,g.event_id,e.title FROM guest_members m JOIN guests g ON g.id=m.guest_id JOIN events e ON e.id=g.event_id JOIN studios s ON s.id=e.studio_id WHERE m.qr_token=? AND m.attendance_status='yes' AND g.response_status='yes' AND e.checkin_mode='individual' AND e.status='active' AND s.status='active'`,raw);
 if(m) return {...m,subject:`member:${m.member_id}`}; fail(403,'QR inválido ou presença não confirmada.');
}
