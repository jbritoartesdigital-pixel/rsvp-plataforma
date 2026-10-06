import {fail,now,id,token,stmt,one,all,run,body,text,slug,choice,integer,date,safeObject,audit,json,limit} from './core.js';
import {session,owner} from './auth.js';

const DEFAULT_EXTRA_FIELDS={phone:true,dietary:true,notes:false,message:true};
const DEFAULT_CLIENT_PERMISSIONS={
 view:true,manage_guests:false,manage_appearance:false,manage_texts:false,
 view_messages:true,export_guests:true,manage_event_details:false
};

const parseObject=(value,fallback={})=>{
 try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:fallback;}
 catch{return fallback;}
};
const boolObject=(value,defaults)=>Object.fromEntries(Object.keys(defaults).map(k=>[k,value?.[k]===undefined?defaults[k]:!!value[k]]));
const tenantPublicOrigin=(env,studioSlug)=>{
 try{
  const host=new URL(env.APP_ORIGIN).hostname;
  if(host==='localhost'||host==='127.0.0.1')return env.APP_ORIGIN;
 }catch{}
 return `https://${slug(studioSlug)}.presencaconfirmada.com.br`;
};
function cleanAppearance(value,current={}) {
 const raw=parseObject(value),out={...parseObject(current)};
 const colorKeys=['color','button_color','button_text_color','background_color','card_color','text_color','muted_color','overlay_color'];
 for(const key of colorKeys)if(raw[key]!==undefined&&/^#[a-f0-9]{6}$/i.test(String(raw[key])))out[key]=String(raw[key]);
 const enumValues={font_style:['modern','elegant','friendly'],card_style:['soft','glass','solid'],background_position:['center','top','bottom'],background_x:['left','center','right'],card_width:['narrow','medium','wide'],interface_language:['pt-BR','en'],background_type:['none','image','video']};
 for(const [key,values] of Object.entries(enumValues))if(raw[key]!==undefined&&values.includes(raw[key]))out[key]=raw[key];
 const ranges={overlay_opacity:[0,1],card_opacity:[.55,1],card_blur:[0,30],card_radius:[0,40]};
 for(const [key,[min,max]] of Object.entries(ranges))if(raw[key]!==undefined){const n=Number(raw[key]);if(Number.isFinite(n)&&n>=min&&n<=max)out[key]=n;}
 const mediaKeys=['background_url','cover_url','logo_url'];
 for(const key of mediaKeys)if(raw[key]!==undefined)out[key]=/^\/media\/[a-f0-9-]+$/i.test(String(raw[key]))?String(raw[key]):'';
 if(raw.background!==undefined&&!raw.background_url&&/^\/media\/[a-f0-9-]+$/i.test(String(raw.background))){out.background_url=String(raw.background);out.background_type='image';}
 for(const key of ['invitation_url'])if(raw[key]!==undefined){try{const u=new URL(String(raw[key]));out[key]=['http:','https:'].includes(u.protocol)?u.href:'';}catch{out[key]='';}}
 if(raw.calendar_location!==undefined)out.calendar_location=text(raw.calendar_location,500,false);
 if(raw.calendar_end_time!==undefined)out.calendar_end_time=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(raw.calendar_end_time))?String(raw.calendar_end_time):'';
 return out;
}

const nullableLimit=(value)=>{
 if(value===undefined||value===null||value==='')return null;
 return integer(value,0,100);
};
const memberKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

async function eventEntitlement(env,studioId){
 const s=await one(env,'SELECT status,billing_mode,credits,monthly_until FROM studios WHERE id=?',studioId);
 if(!s||s.status!=='active')return {can_create:false,mode:s?.billing_mode||'credits',credits:Number(s?.credits||0),monthly_until:s?.monthly_until||null,reason:'Esta conta não está liberada para criar eventos.'};
 const stamp=now(),monthly=s.billing_mode==='monthly'&&s.monthly_until&&s.monthly_until>stamp,credits=s.billing_mode==='credits'&&Number(s.credits)>0;
 if(monthly)return {can_create:true,mode:'monthly',credits:Number(s.credits||0),monthly_until:s.monthly_until,reason:''};
 if(credits)return {can_create:true,mode:'credits',credits:Number(s.credits||0),monthly_until:s.monthly_until||null,reason:''};
 const reason=s.billing_mode==='monthly'?'Sua mensalidade ainda não está vigente. Conclua o pagamento para criar eventos.':'Você não tem créditos disponíveis. Compre um crédito ou ative a mensalidade para criar eventos.';
 return {can_create:false,mode:s.billing_mode,credits:Number(s.credits||0),monthly_until:s.monthly_until||null,reason};
}
async function requireEventEntitlement(env,studioId){
 const entitlement=await eventEntitlement(env,studioId);
 if(!entitlement.can_create)fail(402,entitlement.reason);
 return entitlement;
}

export async function tenantEvent(env,user,eventId) {
 if(!user.studio_id) fail(400,'Selecione uma conviteira.');
 const e=await one(env,'SELECT * FROM events WHERE id=? AND studio_id=?',eventId,user.studio_id);
 if(!e) fail(404,'Evento não encontrado.');
 return e;
}

function publicEvent(e,env={}) {
 return {
  id:e.id,title:e.title,event_date:e.event_date,location:e.location,deadline:e.deadline,status:e.status,
  rsvp_mode:e.rsvp_mode,list_behavior:e.list_behavior||'strict',max_people:e.rsvp_mode==='free'?100:e.max_people,checkin_mode:e.checkin_mode,
  appearance:parseObject(e.appearance),extra_fields:{...DEFAULT_EXTRA_FIELDS,...parseObject(e.extra_fields)},
  public_texts:parseObject(e.public_texts),welcome_message:e.welcome_message,
  studio_name:e.studio_name,brand:parseObject(e.brand),turnstile_sitekey:env.TURNSTILE_SITEKEY||''
 };
}

function accepting(e) {
 if(e.status!=='active'||e.studio_status==='suspended'||(e.deadline&&e.deadline<now())) fail(403,'Confirmações encerradas.');
}

async function verifyTurnstile(env,request,response) {
 if(!env.TURNSTILE_SECRET)return;
 if(!response)fail(400,'Conclua a verificação de segurança.');
 const form=new FormData();
 form.set('secret',env.TURNSTILE_SECRET);
 form.set('response',String(response));
 const ip=request.headers.get('cf-connecting-ip');
 if(ip)form.set('remoteip',ip);
 const fetcher=env.TURNSTILE_FETCH||fetch;
 const r=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});
 if(!r.ok)fail(503,'Não foi possível validar a verificação de segurança.');
 const result=await r.json();
 if(!result.success)fail(400,'Verificação de segurança inválida. Tente novamente.');
}

async function guestData(env,g,privateView=false) {
 const members=await all(env,'SELECT id,name,person_type,attendance_status,qr_token,is_preapproved FROM guest_members WHERE guest_id=? ORDER BY rowid',g.id);
 const data={
  id:g.id,name:g.name,group_label:g.group_label||'',response_status:g.response_status,max_people:g.max_people,
  max_adults_allowed:g.max_adults_allowed,max_children_allowed:g.max_children_allowed,
  message:g.message,dietary:g.dietary,notes:g.notes||'',token:g.token,qr_token:g.qr_token,
  source:g.source||'admin',created_at:g.created_at||null,responded_at:g.responded_at||null,deleted_at:g.deleted_at||null,members
 };
 if(privateView)data.phone=g.phone;
 return data;
}

function compositionLimits(e,g,members) {
 const confirmed=members.filter(m=>m.attendance_status==='yes'),eventLimit=e.rsvp_mode==='free'?100:e.max_people,guestLimit=e.rsvp_mode==='free'?100:g.max_people;
 if(confirmed.length>Math.min(eventLimit,guestLimit)) fail(400,'A quantidade de pessoas confirmadas ultrapassa o limite deste convite.');
 const adults=confirmed.filter(m=>m.person_type==='adult').length;
 const children=confirmed.filter(m=>m.person_type==='child').length;
 if(g.max_adults_allowed!==null&&g.max_adults_allowed!==undefined&&adults>Number(g.max_adults_allowed)) fail(400,`Este convite permite no máximo ${g.max_adults_allowed} adulto(s).`);
 if(g.max_children_allowed!==null&&g.max_children_allowed!==undefined&&children>Number(g.max_children_allowed)) fail(400,`Este convite permite no máximo ${g.max_children_allowed} criança(s).`);
}

async function saveRsvp(env,e,g,b,{actor=null,source='public',allowStructure=false}={}) {
 if(g.deleted_at)fail(404,'Convidado não encontrado.');
 const requested=choice(b.response_status||g.response_status,['yes','no','pending']);
 const incoming=Array.isArray(b.members)?b.members:[];
 const old=await all(env,'SELECT * FROM guest_members WHERE guest_id=? ORDER BY rowid',g.id);
 const oldById=new Map(old.map(m=>[m.id,m]));
 const byName=new Map();
 for(const member of old){const key=memberKey(member.name);if(key)byName.set(key,byName.has(key)?null:member);}
 let base=incoming;

 if(!base.length){
  if(old.length)base=old.map(m=>({id:m.id,name:m.name,person_type:m.person_type,attendance_status:requested}));
  else base=[{name:text(b.name||g.name),person_type:'adult',attendance_status:requested}];
 }

 const clean=base.map(m=>{
  const known=m.id?oldById.get(String(m.id)):(m.name?byName.get(memberKey(m.name)):null);
  if(m.id&&!known)fail(400,'Pessoa inválida.');
  if(!known&&e.rsvp_mode==='list'&&e.list_behavior==='strict'&&!allowStructure)fail(403,'Este convite não permite adicionar novas pessoas.');
  const attendance=requested==='no'?'no':requested==='pending'?'pending':choice(m.attendance_status||'yes',['yes','no','pending']);
  return {
   id:known?.id||id(),
   name:text(m.name||known?.name),
   person_type:choice(m.person_type||known?.person_type||'adult',['adult','child']),
   attendance_status:attendance,
   is_preapproved:known?Number(known.is_preapproved??1):(allowStructure?1:0)
  };
 });
 if(new Set(clean.map(m=>m.id)).size!==clean.length)fail(400,'Pessoas duplicadas.');

 const stamp=now();
 const name=text(b.name??g.name);
 const groupLabel=allowStructure&&b.group_label!==undefined?text(b.group_label,160,false):g.group_label||'';
 const maxPeople=allowStructure&&b.max_people!==undefined?integer(b.max_people,1,e.max_people):g.max_people;
 const maxAdults=allowStructure&&b.max_adults_allowed!==undefined?nullableLimit(b.max_adults_allowed):g.max_adults_allowed;
 const maxChildren=allowStructure&&b.max_children_allowed!==undefined?nullableLimit(b.max_children_allowed):g.max_children_allowed;
 compositionLimits(e,{...g,max_people:maxPeople,max_adults_allowed:maxAdults,max_children_allowed:maxChildren},clean);

 let status=requested;
 if(requested==='yes'){
  status=clean.some(m=>m.attendance_status==='yes')?'yes':clean.some(m=>m.attendance_status==='pending')?'pending':'no';
 }
 const phone=text(b.phone??g.phone,40,false);
 const respondedAt=source==='public'?stamp:(g.responded_at||null);
 const message=text(b.message??g.message,2000,false);
 const dietary=text(b.dietary??g.dietary,500,false);
 const notes=text(b.notes??g.notes,1000,false);

 const queries=[stmt(env,`UPDATE guests SET name=?,group_label=?,phone=?,response_status=?,max_people=?,max_adults_allowed=?,max_children_allowed=?,message=?,dietary=?,notes=?,responded_at=?,updated_at=?,qr_token=CASE WHEN ?='yes' AND (SELECT checkin_mode FROM events WHERE id=guests.event_id)='family' THEN CASE WHEN response_status='yes' AND qr_token IS NOT NULL THEN qr_token ELSE ? END ELSE NULL END WHERE id=? AND event_id=?`,
  name,groupLabel,phone,status,maxPeople,maxAdults,maxChildren,message,dietary,notes,respondedAt,stamp,status,token(),g.id,e.id)];

 const retained=new Set(clean.map(m=>m.id));
 for(const m of old)if(!retained.has(m.id))queries.push(stmt(env,"UPDATE guest_members SET attendance_status='no',qr_token=NULL WHERE id=? AND guest_id=?",m.id,g.id));
 for(const m of clean){
  const qr=m.attendance_status==='yes'&&e.checkin_mode==='individual'?token():null;
  queries.push(stmt(env,`INSERT INTO guest_members(id,guest_id,event_id,name,person_type,attendance_status,qr_token,is_preapproved)
   VALUES(?,?,?,?,?,?,CASE WHEN (SELECT checkin_mode FROM events WHERE id=?)='individual' THEN ? ELSE NULL END,?)
   ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,person_type=excluded.person_type,attendance_status=excluded.attendance_status,is_preapproved=excluded.is_preapproved,
    qr_token=CASE WHEN excluded.qr_token IS NULL THEN NULL WHEN guest_members.attendance_status='yes' AND guest_members.qr_token IS NOT NULL THEN guest_members.qr_token ELSE excluded.qr_token END
   WHERE guest_members.guest_id=excluded.guest_id AND guest_members.event_id=excluded.event_id`,
   m.id,g.id,e.id,m.name,m.person_type,m.attendance_status,e.id,qr,m.is_preapproved));
 }
 await env.DB.batch(queries);
 await audit(env,e.studio_id,actor,source==='public'?'rsvp_submitted':'guest_updated',{event_id:e.id,guest_id:g.id,status});
 return guestData(env,await one(env,'SELECT * FROM guests WHERE id=?',g.id),source!=='public');
}

async function createGuest(env,e,input,{source='admin'}={}) {
 const guestId=id(),stamp=now(),name=text(input.name),maxPeople=integer(input.max_people||e.max_people,1,e.max_people);
 const maxAdults=nullableLimit(input.max_adults_allowed),maxChildren=nullableLimit(input.max_children_allowed);
 const guestToken=token();
 const members=Array.isArray(input.members)&&input.members.length?input.members:[{name,person_type:'adult'}];
 if(members.length>maxPeople)fail(400,'A família ultrapassa o limite de pessoas.');
 const queries=[stmt(env,`INSERT INTO guests(id,event_id,name,phone,response_status,max_people,message,dietary,token,qr_token,created_at,updated_at,group_label,max_adults_allowed,max_children_allowed,creation_request_id,source,responded_at,deleted_at,notes)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  guestId,e.id,name,text(input.phone,40,false),'pending',maxPeople,'','',guestToken,null,stamp,stamp,text(input.group_label,160,false),maxAdults,maxChildren,null,source,null,null,'')];
 for(const member of members){
  queries.push(stmt(env,'INSERT INTO guest_members(id,guest_id,event_id,name,person_type,attendance_status,qr_token,is_preapproved) VALUES(?,?,?,?,?,?,NULL,1)',id(),guestId,e.id,text(member.name),choice(member.person_type||'adult',['adult','child']),'pending'));
 }
 await env.DB.batch(queries);
 return one(env,'SELECT * FROM guests WHERE id=?',guestId);
}

async function uniqueEventSlug(env,studioId,base) {
 const root=slug(base);
 let candidate=root,index=2;
 while(await one(env,'SELECT id FROM events WHERE studio_id=? AND slug=?',studioId,candidate)){
  const suffix=`-${index++}`,head=root.slice(0,64-suffix.length).replace(/-+$/,'');
  candidate=`${head}${suffix}`;
 }
 return candidate;
}

async function insertEvent(env,u,b,{copyOf=null}={}) {
 await requireEventEntitlement(env,u.studio_id);
 const eventId=id(),created=now();
 const eventSlug=await uniqueEventSlug(env,u.studio_id,b.slug||b.title);
 const appearance=b.appearance?safeObject(cleanAppearance(b.appearance)):'{}';
 const extra=safeObject({...DEFAULT_EXTRA_FIELDS,...parseObject(b.extra_fields)});
 const publicTexts=safeObject(parseObject(b.public_texts));
 const permissions=safeObject(boolObject(parseObject(b.client_permissions),DEFAULT_CLIENT_PERMISSIONS));
 await run(env,`INSERT INTO events(id,studio_id,title,slug,event_date,location,deadline,status,rsvp_mode,max_people,checkin_mode,appearance,welcome_message,client_token,client_permissions,created_at,list_behavior,extra_fields,public_texts,archived_at)
 VALUES(?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?,?,?,NULL)`,
  eventId,u.studio_id,text(b.title),eventSlug,date(b.event_date),text(b.location,300,false),date(b.deadline),
  choice(b.rsvp_mode||'free',['free','list']),choice(b.rsvp_mode||'free',['free','list'])==='free'?100:integer(b.max_people||10,1,100),choice(b.checkin_mode||'off',['off','family','individual']),
  appearance,text(b.welcome_message,2000,false),token(),permissions,created,choice(b.list_behavior||'strict',['strict','flexible']),extra,publicTexts);
 await audit(env,u.studio_id,u.id,copyOf?'duplicate_event':'create_event',{event_id:eventId,source_event_id:copyOf||null});
 return tenantEvent(env,u,eventId);
}

function sanitizedClientGuest(data,permissions){
 const copy={...data,members:data.members.map(({qr_token,...m})=>m)};
 delete copy.token;delete copy.qr_token;
 if(!permissions.view_messages){copy.message='';copy.notes='';}
 return copy;
}

export async function eventsRoutes(request,env,path,url) {
 const method=request.method;
 let match=path.match(/^\/api\/public\/([^/]+)\/([^/]+)(?:\/(rsvp))?$/);
 if(match){
  const e=await one(env,'SELECT e.*,s.name studio_name,s.brand,s.status studio_status FROM events e JOIN studios s ON s.id=e.studio_id WHERE s.slug=? AND e.slug=?',match[1],match[2]);
  if(!e||e.status!=='active'||e.studio_status!=='active')fail(404,'Evento indisponível.');
  if(!match[3]&&method==='GET'){
   const invite=url.searchParams.get('invite');
   const g=invite?await one(env,'SELECT * FROM guests WHERE event_id=? AND token=? AND deleted_at IS NULL',e.id,invite):null;
   return json({event:publicEvent(e,env),guest:g?await guestData(env,g):null});
  }
  if(match[3]&&method==='POST'){
   accepting(e);
   await limit(env,`rsvp:${e.id}:${request.headers.get('cf-connecting-ip')||'local'}`,30);
   const b=await body(request);
   await verifyTurnstile(env,request,b.turnstile_token);
   let g=b.token?await one(env,'SELECT * FROM guests WHERE token=? AND event_id=? AND deleted_at IS NULL',String(b.token),e.id):null;
   if(b.token&&!g)fail(404,'Convite inválido.');
   const requestId=b.creation_request_id?text(b.creation_request_id,120):null;
   if(!g&&requestId){
    g=await one(env,'SELECT * FROM guests WHERE event_id=? AND creation_request_id=? AND deleted_at IS NULL',e.id,requestId);
    if(g?.responded_at)return json({guest:await guestData(env,g)});
   }
   if(!g){
    if(e.rsvp_mode==='list')fail(403,'Abra o link individual enviado pelo anfitrião.');
    const created=now(),guestId=id(),guestName=text(b.name);
    const members=Array.isArray(b.members)&&b.members.length?b.members:[{name:guestName,person_type:'adult',attendance_status:b.response_status||'pending'}];
    if(members.length>(e.rsvp_mode==='free'?100:e.max_people))fail(400,'Informe as pessoas dentro do limite do convite.');
    try{
     await run(env,`INSERT INTO guests(id,event_id,name,phone,response_status,max_people,message,dietary,token,qr_token,created_at,updated_at,group_label,max_adults_allowed,max_children_allowed,creation_request_id,source,responded_at,deleted_at,notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      guestId,e.id,guestName,'','pending',e.rsvp_mode==='free'?100:e.max_people,'','',token(),null,created,created,'',null,null,requestId,'public',null,null,'');
     g=await one(env,'SELECT * FROM guests WHERE id=?',guestId);
    }catch(error){
     if(requestId)g=await one(env,'SELECT * FROM guests WHERE event_id=? AND creation_request_id=?',e.id,requestId);
     if(!g)throw error;
    }
   }
   return json({guest:await saveRsvp(env,e,g,b,{source:'public'})});
  }
 }

 match=path.match(/^\/api\/q\/([^/]+)$/);
 if(match&&method==='GET'){
  const qr=await validQR(env,match[1]);
  return json({name:qr.name,event_title:qr.title,token:match[1],checked_in:!!await one(env,'SELECT id FROM checkins WHERE subject_key=?',qr.subject)});
 }

 match=path.match(/^\/api\/cliente\/([^/]+)(?:\/(guests|event|media)(?:\/([^/]+))?)?$/);
 if(match){
  const e=await one(env,'SELECT e.*,s.name studio_name,s.brand,s.status studio_status FROM events e JOIN studios s ON s.id=e.studio_id WHERE client_token=?',match[1]);
  if(!e||e.studio_status!=='active')fail(404,'Link indisponível.');
  const permissions={...DEFAULT_CLIENT_PERMISSIONS,...parseObject(e.client_permissions)};
  const sub=match[2],key=match[3];

  if(!sub&&method==='GET'&&permissions.view){
   const guests=await all(env,'SELECT * FROM guests WHERE event_id=? AND deleted_at IS NULL ORDER BY name',e.id);
   return json({event:publicEvent(e,env),permissions,guests:await Promise.all(guests.map(async g=>sanitizedClientGuest(await guestData(env,g,true),permissions)))});
  }
  if(sub==='guests'&&method==='POST'&&permissions.manage_guests){
   const created=await createGuest(env,e,await body(request),{source:'client'});
   await audit(env,e.studio_id,null,'guest_created',{event_id:e.id,guest_id:created.id,source:'client'});
   return json({guest:sanitizedClientGuest(await guestData(env,created,true),permissions)},201);
  }
  if(sub==='guests'&&key&&method==='PATCH'&&permissions.manage_guests){
   const g=await one(env,'SELECT * FROM guests WHERE id=? AND event_id=? AND deleted_at IS NULL',key,e.id);if(!g)fail(404,'Convidado não encontrado.');
   const saved=await saveRsvp(env,e,g,await body(request),{source:'client',allowStructure:true});
   return json({guest:sanitizedClientGuest(saved,permissions)});
  }
  if(sub==='guests'&&key&&method==='DELETE'&&permissions.manage_guests){
   await run(env,"UPDATE guests SET deleted_at=?,response_status='no',qr_token=NULL,updated_at=? WHERE id=? AND event_id=?",now(),now(),key,e.id);
   await audit(env,e.studio_id,null,'guest_deleted',{event_id:e.id,guest_id:key,source:'client'});
   return json({ok:true});
  }
  if(sub==='media'&&permissions.manage_appearance){
   if(method==='GET')return json({media:await all(env,'SELECT id,mime_type,size_bytes,media_kind,original_name,created_at FROM event_media WHERE event_id=? AND studio_id=? AND deleted_at IS NULL ORDER BY created_at DESC',e.id,e.studio_id)});
   if(method==='POST'&&!key){
    const kind=choice(url.searchParams.get('kind')||request.headers.get('x-media-kind')||'background_image',['background_image','background_video','cover','logo','other']);
    const mime=request.headers.get('content-type')?.split(';')[0],images=['image/jpeg','image/png','image/webp','image/avif'],videos=['video/mp4','video/webm'],allowed=kind==='background_video'?videos:kind==='other'?[...images,...videos]:images;
    if(!allowed.includes(mime))fail(400,kind==='background_video'?'Use vídeo MP4 ou WebM.':'Use imagem JPG, PNG, WebP ou AVIF.');
    const bytes=await request.arrayBuffer(),max=videos.includes(mime)?20*1024*1024:10*1024*1024;if(!bytes.byteLength||bytes.byteLength>max)fail(413,`O arquivo deve ter até ${videos.includes(mime)?20:10} MB.`);
    const mediaId=id(),object=`${e.studio_id}/${e.id}/${mediaId}`;let original='';try{original=decodeURIComponent(request.headers.get('x-file-name')||'');}catch{original=request.headers.get('x-file-name')||'';}original=text(original,240,false);
    await env.MEDIA.put(object,bytes,{httpMetadata:{contentType:mime}});
    try{await run(env,'INSERT INTO event_media(id,event_id,studio_id,object_key,mime_type,size_bytes,created_at,media_kind,original_name,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)',mediaId,e.id,e.studio_id,object,mime,bytes.byteLength,now(),kind,original);}catch(error){await env.MEDIA.delete(object);throw error;}
    await audit(env,e.studio_id,null,'media_uploaded',{event_id:e.id,media_id:mediaId,media_kind:kind,source:'client'});
    return json({media:{id:mediaId,url:`/media/${mediaId}`,mime_type:mime,media_kind:kind,original_name:original}},201);
   }
   if(method==='DELETE'&&key){
    const media=await one(env,'SELECT * FROM event_media WHERE id=? AND event_id=? AND studio_id=? AND deleted_at IS NULL',key,e.id,e.studio_id);if(!media)fail(404,'Mídia não encontrada.');
    await env.MEDIA.delete(media.object_key);await run(env,'UPDATE event_media SET deleted_at=? WHERE id=?',now(),media.id);
    const appearance=parseObject(e.appearance),url=`/media/${media.id}`;for(const k of ['background_url','cover_url','logo_url'])if(appearance[k]===url)appearance[k]='';if(appearance.background_url==='')appearance.background_type='none';
    await run(env,'UPDATE events SET appearance=? WHERE id=?',JSON.stringify(appearance),e.id);
    await audit(env,e.studio_id,null,'media_deleted',{event_id:e.id,media_id:media.id,source:'client'});return json({ok:true});
   }
  }
  if(sub==='event'&&method==='PATCH'){
   const b=await body(request),sets=[],args=[];
   if(permissions.manage_event_details){
    for(const [column,value] of [['title',b.title],['location',b.location]])if(value!==undefined){sets.push(`${column}=?`);args.push(text(value,column==='location'?300:160,column!=='location'));}
    if(b.event_date!==undefined){sets.push('event_date=?');args.push(date(b.event_date));}
    if(b.deadline!==undefined){sets.push('deadline=?');args.push(date(b.deadline));}
    if(b.extra_fields!==undefined){sets.push('extra_fields=?');args.push(safeObject({...DEFAULT_EXTRA_FIELDS,...parseObject(b.extra_fields)}));}
   }
   if(permissions.manage_appearance&&b.appearance!==undefined){sets.push('appearance=?');args.push(safeObject(cleanAppearance(b.appearance,e.appearance)));}
   if(permissions.manage_texts){
    if(b.welcome_message!==undefined){sets.push('welcome_message=?');args.push(text(b.welcome_message,2000,false));}
    if(b.public_texts!==undefined){sets.push('public_texts=?');args.push(safeObject(b.public_texts));}
   }
   if(!sets.length)fail(403,'Permissão não disponível nesse link.');
   args.push(e.id);
   await run(env,`UPDATE events SET ${sets.join(',')} WHERE id=?`,...args);
   await audit(env,e.studio_id,null,'client_event_updated',{event_id:e.id});
   return json({ok:true});
  }
  fail(403,'Permissão não disponível nesse link.');
 }

 if(path==='/api/events/entitlement'){
  const u=await session(request,env);if(!u.studio)fail(400,'Selecione uma conviteira.');
  if(method!=='GET')fail(405,'Método não permitido.');
  return json({entitlement:await eventEntitlement(env,u.studio_id)});
 }

 if(path==='/api/events'){
  const u=await session(request,env);if(!u.studio)fail(400,'Selecione uma conviteira.');
  if(method==='GET'){
   const archived=url.searchParams.get('archived')==='1';
   const events=await all(env,`SELECT e.*,
    (SELECT COUNT(*) FROM guests g WHERE g.event_id=e.id AND g.deleted_at IS NULL) guest_count,
    (SELECT COUNT(*) FROM guests g WHERE g.event_id=e.id AND g.deleted_at IS NULL AND g.response_status='yes') yes_count,
    (SELECT COUNT(*) FROM guests g WHERE g.event_id=e.id AND g.deleted_at IS NULL AND g.response_status='pending') pending_count
    FROM events e WHERE e.studio_id=? AND e.status ${archived?"='archived'":"<>'archived'"} ORDER BY e.created_at DESC LIMIT 500`,u.studio_id);
   return json({events,entitlement:await eventEntitlement(env,u.studio_id)});
  }
  if(method==='POST'){
   const event=await insertEvent(env,u,await body(request));
   return json({event},201);
  }
 }

 match=path.match(/^\/api\/events\/([^/]+)(?:\/(guests|checkins|client-link|media|audit|duplicate|archive|restore)(?:\/([^/]+))?(?:\/([^/]+))?)?$/);
 if(match){
  const u=await session(request,env),e=await tenantEvent(env,u,match[1]),sub=match[2],key=match[3],action=match[4];

  if(!sub&&method==='GET')return json({event:e});
  if(!sub&&method==='PATCH'){
   const b=await body(request);
   const nextStatus=choice(b.status??e.status,['active','inactive','archived']);
   await run(env,`UPDATE events SET
    title=?,event_date=?,location=?,deadline=?,status=?,rsvp_mode=?,list_behavior=?,max_people=?,checkin_mode=?,
    appearance=?,extra_fields=?,public_texts=?,client_permissions=?,welcome_message=?,archived_at=?
    WHERE id=? AND studio_id=?`,
    text(b.title??e.title),date(b.event_date??e.event_date),text(b.location??e.location,300,false),date(b.deadline===undefined?e.deadline:b.deadline),
    nextStatus,choice(b.rsvp_mode??e.rsvp_mode,['free','list']),choice(b.list_behavior??e.list_behavior,['strict','flexible']),
    choice(b.rsvp_mode??e.rsvp_mode,['free','list'])==='free'?100:integer(b.max_people??e.max_people,1,100),choice(b.checkin_mode??e.checkin_mode,['off','family','individual']),
    b.appearance?safeObject(cleanAppearance(b.appearance,e.appearance)):e.appearance,b.extra_fields?safeObject({...DEFAULT_EXTRA_FIELDS,...parseObject(b.extra_fields)}):e.extra_fields,
    b.public_texts?safeObject(b.public_texts):e.public_texts,b.client_permissions?safeObject(boolObject(parseObject(b.client_permissions),DEFAULT_CLIENT_PERMISSIONS)):e.client_permissions,text(b.welcome_message??e.welcome_message,2000,false),
    nextStatus==='archived'?(e.archived_at||now()):null,e.id,u.studio_id);
   await audit(env,u.studio_id,u.id,'update_event',{event_id:e.id,status:nextStatus});
   return json({event:await tenantEvent(env,u,e.id)});
  }

  if(sub==='duplicate'&&method==='POST'){
   const source={...e,title:`${e.title} (cópia)`,slug:`${e.slug}-copia`,appearance:parseObject(e.appearance),extra_fields:parseObject(e.extra_fields),public_texts:parseObject(e.public_texts),client_permissions:parseObject(e.client_permissions)};
   const event=await insertEvent(env,u,source,{copyOf:e.id});
   return json({event},201);
  }
  if(sub==='archive'&&method==='POST'){
   await run(env,"UPDATE events SET status='archived',archived_at=? WHERE id=? AND studio_id=?",now(),e.id,u.studio_id);
   await audit(env,u.studio_id,u.id,'archive_event',{event_id:e.id});return json({ok:true});
  }
  if(sub==='restore'&&method==='POST'){
   await run(env,"UPDATE events SET status='active',archived_at=NULL WHERE id=? AND studio_id=?",e.id,u.studio_id);
   await audit(env,u.studio_id,u.id,'restore_event',{event_id:e.id});return json({ok:true});
  }
  if(sub==='audit'&&method==='GET'){
   return json({audit:await all(env,'SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.event_id=? AND a.studio_id=? ORDER BY a.created_at DESC LIMIT 200',e.id,u.studio_id)});
  }
  if(sub==='client-link'&&method==='POST'){
   const b=await body(request),raw=token(),permissions=boolObject(b,DEFAULT_CLIENT_PERMISSIONS);
   await run(env,'UPDATE events SET client_token=?,client_permissions=? WHERE id=? AND studio_id=?',raw,JSON.stringify(permissions),e.id,u.studio_id);
   await audit(env,u.studio_id,u.id,'client_link_reset',{event_id:e.id});
   return json({url:`${tenantPublicOrigin(env,u.studio.slug)}/cliente/${raw}`,permissions});
  }

  if(sub==='guests'){
   if(method==='GET'){
    const trash=url.searchParams.get('trash')==='1';
    const guests=await all(env,`SELECT * FROM guests WHERE event_id=? AND deleted_at IS ${trash?'NOT NULL':'NULL'} ORDER BY name LIMIT 2000`,e.id);
    return json({guests:await Promise.all(guests.map(g=>guestData(env,g,true)))});
   }
   if(method==='POST'&&key==='bulk'){
    const b=await body(request),ids=Array.isArray(b.ids)?[...new Set(b.ids.map(String))]:[];
    if(!ids.length||ids.length>300)fail(400,'Selecione entre 1 e 300 convidados.');
    const placeholders=ids.map(()=>'?').join(',');
    if(b.action==='delete'){
     await run(env,`UPDATE guests SET deleted_at=?,response_status='no',qr_token=NULL,updated_at=? WHERE event_id=? AND id IN (${placeholders})`,now(),now(),e.id,...ids);
     await audit(env,u.studio_id,u.id,'guest_bulk_deleted',{event_id:e.id,count:ids.length});return json({ok:true});
    }
    if(b.action==='restore'){
     await run(env,`UPDATE guests SET deleted_at=NULL,response_status='pending',qr_token=NULL,updated_at=? WHERE event_id=? AND id IN (${placeholders})`,now(),e.id,...ids);
     await run(env,`UPDATE guest_members SET attendance_status='pending',qr_token=NULL WHERE event_id=? AND guest_id IN (${placeholders})`,e.id,...ids);
     await audit(env,u.studio_id,u.id,'guest_bulk_restored',{event_id:e.id,count:ids.length});return json({ok:true});
    }
    fail(400,'Ação inválida.');
   }
   if(method==='POST'&&!key){
    const b=await body(request),rows=b.guests||[b];
    if(!Array.isArray(rows)||rows.length<1||rows.length>300)fail(400,'Importe até 300 convidados por vez.');
    const source=b.guests?'import':'admin',created=[];
    for(const row of rows)created.push(await createGuest(env,e,row,{source}));
    await audit(env,u.studio_id,u.id,'guest_created',{event_id:e.id,count:created.length,source});
    return json({ok:true,count:created.length},201);
   }
   if(method==='POST'&&key&&action==='restore'){
    await run(env,"UPDATE guests SET deleted_at=NULL,response_status='pending',qr_token=NULL,updated_at=? WHERE id=? AND event_id=?",now(),key,e.id);
    await run(env,"UPDATE guest_members SET attendance_status='pending',qr_token=NULL WHERE guest_id=? AND event_id=?",key,e.id);
    await audit(env,u.studio_id,u.id,'guest_restored',{event_id:e.id,guest_id:key});return json({ok:true});
   }
   if(method==='PATCH'&&key){
    const g=await one(env,'SELECT * FROM guests WHERE id=? AND event_id=? AND deleted_at IS NULL',key,e.id);if(!g)fail(404,'Convidado não encontrado.');
    return json({guest:await saveRsvp(env,e,g,await body(request),{actor:u.id,source:'admin',allowStructure:true})});
   }
   if(method==='DELETE'&&key){
    await run(env,"UPDATE guests SET deleted_at=?,response_status='no',qr_token=NULL,updated_at=? WHERE id=? AND event_id=?",now(),now(),key,e.id);
    await audit(env,u.studio_id,u.id,'guest_deleted',{event_id:e.id,guest_id:key});return json({ok:true});
   }
  }

  if(sub==='checkins'){
   if(method==='GET')return json({checkins:await all(env,`SELECT c.*,COALESCE(m.name,g.name) name FROM checkins c JOIN guests g ON g.id=c.guest_id LEFT JOIN guest_members m ON m.id=c.member_id AND m.guest_id=g.id WHERE c.event_id=? ORDER BY c.created_at DESC`,e.id)});
   if(method==='POST'){
    const b=await body(request);let raw=b.token;
    if(!raw&&b.guest_id){
     const g=await one(env,"SELECT * FROM guests WHERE id=? AND event_id=? AND response_status='yes' AND deleted_at IS NULL",String(b.guest_id),e.id);if(!g)fail(403,'Presença não confirmada.');
     raw=e.checkin_mode==='family'?g.qr_token:(await one(env,"SELECT qr_token FROM guest_members WHERE id=? AND guest_id=? AND attendance_status='yes'",String(b.member_id||''),g.id))?.qr_token;
    }
    const qr=await validQR(env,String(raw||''));if(qr.event_id!==e.id)fail(403,'QR pertence a outro evento.');
    const inserted=await run(env,`INSERT OR IGNORE INTO checkins SELECT ?,e.id,g.id,?,?,?, ?,? FROM guests g JOIN events e ON e.id=g.event_id JOIN studios s ON s.id=e.studio_id WHERE g.id=? AND e.id=? AND e.studio_id=? AND s.status='active' AND e.status='active' AND g.response_status='yes' AND g.deleted_at IS NULL AND ((e.checkin_mode='family' AND g.qr_token=?) OR (e.checkin_mode='individual' AND EXISTS(SELECT 1 FROM guest_members m WHERE m.id=? AND m.guest_id=g.id AND m.attendance_status='yes' AND m.qr_token=?)))`,
     id(),qr.member_id,qr.subject,raw,u.id,now(),qr.guest_id,e.id,u.studio_id,raw,qr.member_id,raw);
    const existing=await one(env,'SELECT * FROM checkins WHERE subject_key=?',qr.subject);if(!existing)fail(409,'QR invalidado.');
    await audit(env,u.studio_id,u.id,'checkin',{event_id:e.id,guest_id:qr.guest_id,member_id:qr.member_id||null});
    return json({ok:true,already_checked_in:!inserted.meta.changes,checkin:existing});
   }
  }

  if(sub==='media'){
   if(method==='GET'){
    return json({media:await all(env,'SELECT id,mime_type,size_bytes,media_kind,original_name,created_at FROM event_media WHERE event_id=? AND studio_id=? AND deleted_at IS NULL ORDER BY created_at DESC',e.id,u.studio_id)});
   }
   if(method==='POST'&&!key){
    const kind=choice(url.searchParams.get('kind')||request.headers.get('x-media-kind')||'background_image',['background_image','background_video','cover','logo','other']);
    const mime=request.headers.get('content-type')?.split(';')[0];
    const image=['image/jpeg','image/png','image/webp','image/avif'],video=['video/mp4','video/webm'];
    const allowed=kind==='background_video'?video:kind==='other'?[...image,...video]:image;
    if(!allowed.includes(mime))fail(400,kind==='background_video'?'Use vídeo MP4 ou WebM.':'Use imagem JPG, PNG, WebP ou AVIF.');
    const bytes=await request.arrayBuffer(),max=video.includes(mime)?20*1024*1024:10*1024*1024;
    if(!bytes.byteLength||bytes.byteLength>max)fail(413,`O arquivo deve ter até ${video.includes(mime)?20:10} MB.`);
    const mediaId=id(),object=`${u.studio_id}/${e.id}/${mediaId}`;let original='';try{original=decodeURIComponent(request.headers.get('x-file-name')||'');}catch{original=request.headers.get('x-file-name')||'';}original=text(original,240,false);
    await env.MEDIA.put(object,bytes,{httpMetadata:{contentType:mime}});
    try{
     await run(env,'INSERT INTO event_media(id,event_id,studio_id,object_key,mime_type,size_bytes,created_at,media_kind,original_name,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)',mediaId,e.id,u.studio_id,object,mime,bytes.byteLength,now(),kind,original);
    }catch(error){await env.MEDIA.delete(object);throw error;}
    await audit(env,u.studio_id,u.id,'media_uploaded',{event_id:e.id,media_id:mediaId,media_kind:kind});
    return json({media:{id:mediaId,url:`/media/${mediaId}`,mime_type:mime,media_kind:kind,original_name:original}},201);
   }
   if(method==='DELETE'&&key){
    const media=await one(env,'SELECT * FROM event_media WHERE id=? AND event_id=? AND studio_id=? AND deleted_at IS NULL',key,e.id,u.studio_id);if(!media)fail(404,'Mídia não encontrada.');
    await env.MEDIA.delete(media.object_key);
    await run(env,'UPDATE event_media SET deleted_at=? WHERE id=?',now(),media.id);
    const appearance=parseObject(e.appearance),url=`/media/${media.id}`;for(const k of ['background_url','cover_url','logo_url'])if(appearance[k]===url)appearance[k]='';if(!appearance.background_url)appearance.background_type='none';
    await run(env,'UPDATE events SET appearance=? WHERE id=? AND studio_id=?',JSON.stringify(appearance),e.id,u.studio_id);
    await audit(env,u.studio_id,u.id,'media_deleted',{event_id:e.id,media_id:media.id,media_kind:media.media_kind});
    return json({ok:true});
   }
  }
 }

 if(path==='/api/brand'){
  const u=await session(request,env);if(!u.studio)fail(400,'Selecione uma conviteira.');
  if(method==='GET')return json({studio:u.studio});
  if(method==='PATCH'){
   owner(u);const b=await body(request);
   await run(env,'UPDATE studios SET name=?,whatsapp=?,brand=? WHERE id=?',text(b.name??u.studio.name),text(b.whatsapp??u.studio.whatsapp,40),safeObject(b.brand||{}),u.studio_id);
   await audit(env,u.studio_id,u.id,'brand_updated');return json({ok:true});
  }
 }
 return null;
}

export async function validQR(env,raw) {
 const g=await one(env,`SELECT g.id guest_id,g.name,g.event_id,e.title,e.checkin_mode,g.qr_token FROM guests g JOIN events e ON e.id=g.event_id JOIN studios s ON s.id=e.studio_id WHERE g.qr_token=? AND g.response_status='yes' AND g.deleted_at IS NULL AND e.checkin_mode='family' AND e.status='active' AND s.status='active'`,raw);
 if(g)return {...g,member_id:null,subject:`guest:${g.guest_id}`};
 const m=await one(env,`SELECT m.id member_id,m.name,g.id guest_id,g.event_id,e.title FROM guest_members m JOIN guests g ON g.id=m.guest_id JOIN events e ON e.id=g.event_id JOIN studios s ON s.id=e.studio_id WHERE m.qr_token=? AND m.attendance_status='yes' AND g.response_status='yes' AND g.deleted_at IS NULL AND e.checkin_mode='individual' AND e.status='active' AND s.status='active'`,raw);
 if(m)return {...m,subject:`member:${m.member_id}`};
 fail(403,'QR inválido ou presença não confirmada.');
}
