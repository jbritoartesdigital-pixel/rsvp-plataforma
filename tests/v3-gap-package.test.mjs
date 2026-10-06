import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,approved} from './helpers.mjs';

test('duplicação e modelos criam mídias independentes sem copiar dados do evento',async()=>{
 const f=fixture(),a=await f.register();
 f.exec('UPDATE studios SET credits=3 WHERE id=?',a.user.studio_id);
 const created=await f.request('/api/events','POST',{title:'Base',slug:'base',event_date:'2026-12-20T18:00:00.000Z',location:'Salão A',deadline:'2026-12-10T00:00:00.000Z',rsvp_mode:'list',list_behavior:'flexible',max_people:5,checkin_mode:'family'},a.cookie);
 assert.equal(created.status,201);const e=created.body.event;
 const mediaId='11111111-1111-4111-8111-111111111111',objectKey=`${a.user.studio_id}/${e.id}/${mediaId}`,stamp=new Date().toISOString();
 f.mediaStore.set(objectKey,{bytes:new Uint8Array([1,2,3,4]).buffer,httpMetadata:{contentType:'image/png'},httpEtag:'seed'});
 f.exec("INSERT INTO event_media(id,event_id,studio_id,object_key,mime_type,size_bytes,created_at,media_kind,original_name,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)",mediaId,e.id,a.user.studio_id,objectKey,'image/png',4,stamp,'background_image','fundo.png');
 const appearance={button_color:'#716864',background_type:'image',background_url:`/media/${mediaId}`};
 f.exec('UPDATE events SET appearance=? WHERE id=?',JSON.stringify(appearance),e.id);
 await f.request(`/api/events/${e.id}/guests`,'POST',{name:'Maria',members:[{name:'Maria'},{name:'Bia',person_type:'child'}]},a.cookie);

 const duplicate=await f.request(`/api/events/${e.id}/duplicate`,'POST',{},a.cookie);
 assert.equal(duplicate.status,201);const copy=duplicate.body.event;
 assert.equal(copy.event_date,null);assert.equal(copy.location,'');assert.equal(copy.deadline,null);
 assert.notEqual(copy.client_token,e.client_token);
 assert.equal(f.sql('SELECT COUNT(*) n FROM guests WHERE event_id=?',copy.id).n,0);
 const copyMedia=f.sql('SELECT * FROM event_media WHERE event_id=?',copy.id);assert.ok(copyMedia);assert.notEqual(copyMedia.id,mediaId);assert.notEqual(copyMedia.object_key,objectKey);
 assert.ok(f.mediaStore.has(copyMedia.object_key));
 const copyAppearance=JSON.parse(f.sql('SELECT appearance FROM events WHERE id=?',copy.id).appearance);
 assert.equal(copyAppearance.background_url,`/media/${copyMedia.id}`);
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,1);

 const beforeTemplate=f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits;
 const saved=await f.request(`/api/events/${e.id}/template`,'POST',{name:'Casamento base'},a.cookie);
 assert.equal(saved.status,201);assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,beforeTemplate);
 assert.equal(f.sql('SELECT COUNT(*) n FROM event_templates WHERE studio_id=?',a.user.studio_id).n,1);
 const templateMedia=f.sql('SELECT * FROM template_media WHERE template_id=?',saved.body.template.id);assert.ok(templateMedia);assert.notEqual(templateMedia.object_key,objectKey);
 assert.ok(f.mediaStore.has(templateMedia.object_key));
 const templateConfig=JSON.parse(f.sql('SELECT config FROM event_templates WHERE id=?',saved.body.template.id).config);
 assert.equal(templateConfig.appearance.background_url,`template:${templateMedia.id}`);

 const used=await f.request(`/api/templates/${saved.body.template.id}/use`,'POST',{title:'Nova festa',slug:'nova-festa',event_date:'2027-01-10T15:00:00.000Z',location:'Salão B'},a.cookie);
 assert.equal(used.status,201);const fromTemplate=used.body.event;
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,0);
 assert.equal(f.sql('SELECT COUNT(*) n FROM guests WHERE event_id=?',fromTemplate.id).n,0);
 assert.notEqual(fromTemplate.client_token,e.client_token);assert.notEqual(fromTemplate.client_token,copy.client_token);
 const thirdMedia=f.sql('SELECT * FROM event_media WHERE event_id=?',fromTemplate.id);assert.ok(thirdMedia);assert.notEqual(thirdMedia.object_key,templateMedia.object_key);
 const usedAppearance=JSON.parse(f.sql('SELECT appearance FROM events WHERE id=?',fromTemplate.id).appearance);assert.equal(usedAppearance.background_url,`/media/${thirdMedia.id}`);
 assert.equal(f.mediaStore.size,4);

 assert.equal((await f.request(`/api/templates/${saved.body.template.id}`,'DELETE',{},a.cookie)).status,200);
 assert.equal(f.sql('SELECT COUNT(*) n FROM event_templates').n,0);assert.equal(f.sql('SELECT COUNT(*) n FROM template_media').n,0);
 assert.equal(f.mediaStore.has(templateMedia.object_key),false);
 assert.ok(f.mediaStore.has(objectKey));assert.ok(f.mediaStore.has(copyMedia.object_key));assert.ok(f.mediaStore.has(thirdMedia.object_key));
 assert.equal(f.sql('SELECT COUNT(*) n FROM events WHERE studio_id=?',a.user.studio_id).n,3);
});

test('modelo não consome crédito, não conta como evento e permanece isolado por studio',async()=>{
 const f=fixture(),a=await f.register(),b=await f.register('b');
 const created=await f.request('/api/templates','POST',{name:'Infantil',config:{rsvp_mode:'free',checkin_mode:'off'}},a.cookie);
 assert.equal(created.status,201);
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,0);
 assert.equal(f.sql('SELECT COUNT(*) n FROM events WHERE studio_id=?',a.user.studio_id).n,0);
 assert.equal((await f.request('/api/templates','GET',null,b.cookie)).body.templates.length,0);
 assert.equal((await f.request(`/api/templates/${created.body.template.id}`,'GET',null,b.cookie)).status,404);
 assert.equal((await f.request(`/api/templates/${created.body.template.id}/use`,'POST',{title:'Sem crédito',slug:'sem-credito'},a.cookie)).status,402);
});

test('Super Admin V3 mostra exceção real, reconcilia crédito e mantém trilha auditável',async()=>{
 const f=fixture(),adminUser=await f.register('admin'),client=await f.register('cliente');
 f.exec("UPDATE users SET role='super_admin' WHERE id=?",adminUser.user.id);
 const stamp=new Date().toISOString(),orderId='manual-order';
 f.exec("INSERT INTO billing_orders(id,studio_id,generation,kind,quantity,amount_cents,status,provider_id,checkout_url,created_at,credited_payment_id) VALUES(?,?,?,?,?,?,?,?,?,?,NULL)",orderId,client.user.studio_id,0,'credits',1,1490,'approved','provider-manual','',stamp);
 f.exec("INSERT INTO payments(id,order_id,status,amount_cents,updated_at) VALUES(?,?,?,?,?)",'manual-payment',orderId,'approved',1490,stamp);

 let overview=await f.request('/api/admin/overview','GET',null,adminUser.cookie);
 assert.equal(overview.status,200);assert.equal(overview.body.finance.month.revenue_cents,1490);
 assert.ok(overview.body.exceptions.some(x=>x.type==='credit_missing'&&x.studio_id===client.user.studio_id));

 const reconciled=await f.request(`/api/admin/studios/${client.user.studio_id}/reconcile`,'POST',{},adminUser.cookie);
 assert.equal(reconciled.status,200);assert.equal(reconciled.body.credits_fixed,1);
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',client.user.studio_id).credits,1);
 overview=await f.request('/api/admin/overview','GET',null,adminUser.cookie);
 assert.equal(overview.body.exceptions.some(x=>x.type==='credit_missing'&&x.studio_id===client.user.studio_id),false);

 assert.equal((await f.request(`/api/admin/studios/${client.user.studio_id}`,'PATCH',{commercial_category:'partner'},adminUser.cookie)).status,200);
 assert.equal((await f.request(`/api/admin/studios/${client.user.studio_id}/credits`,'POST',{delta:2,reason:'Cortesia de suporte'},adminUser.cookie)).status,200);
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',client.user.studio_id).credits,3);
 assert.equal((await f.request(`/api/admin/studios/${client.user.studio_id}`,'PATCH',{status:'suspended'},adminUser.cookie)).status,200);
 let detail=await f.request(`/api/admin/studios/${client.user.studio_id}`,'GET',null,adminUser.cookie);
 assert.equal(detail.body.studio.commercial_category,'partner');assert.equal(detail.body.studio.status,'suspended');assert.equal(detail.body.last_access,null);
 assert.match(detail.body.last_access_note,/não registra login/i);
 assert.ok(detail.body.audit.some(x=>x.action==='credit_adjustment'));
 assert.ok(detail.body.audit.some(x=>x.action==='studio_suspended'));
 assert.equal((await f.request(`/api/admin/studios/${client.user.studio_id}`,'PATCH',{status:'active'},adminUser.cookie)).status,200);
});

test('saúde administrativa não expõe secrets e diferencia configuração de integração',async()=>{
 const f=fixture(),adminUser=await f.register('admin'),client=await f.register('cliente');
 f.exec("UPDATE users SET role='super_admin' WHERE id=?",adminUser.user.id);
 f.env.MAILER_URL='https://api.resend.com/emails';f.env.MAILER_TOKEN='mailer-super-secret';f.env.MAILER_FROM='Presença Confirmada <acesso@presencaconfirmada.com.br>';
 f.resources.set('/users/me',{id:123});
 f.env.HEALTH_FETCH=async()=>new Response('{}',{status:200,headers:{'content-type':'application/json'}});
 const stamp=new Date().toISOString();
 f.exec("INSERT INTO integration_events(id,studio_id,provider,kind,external_id,status,message,details,source_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",'mail-ok',client.user.studio_id,'resend','password_reset','x','ok','E-mail enviado.','{}','mail-ok',stamp);
 f.exec("INSERT INTO integration_events(id,studio_id,provider,kind,external_id,status,message,details,source_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",'mp-ok',client.user.studio_id,'mercadopago','payment','1','ok','Webhook válido processado.','{}','mp-ok',stamp);
 const health=await f.request('/api/admin/health','GET',null,adminUser.cookie);
 assert.equal(health.status,200);
 const text=JSON.stringify(health.body);assert.equal(text.includes('mailer-super-secret'),false);assert.equal(text.includes('test-secret'),false);assert.equal(text.includes('test-only'),false);
 assert.ok(health.body.services.some(x=>x.key==='d1'&&x.state==='operational'));
 assert.ok(health.body.services.some(x=>x.key==='r2'&&x.state==='operational'));
 assert.ok(health.body.services.some(x=>x.key==='resend'&&x.state==='operational'));
 assert.ok(health.body.services.some(x=>x.key==='mp_webhooks'&&x.state==='operational'));
});

test('Resend registra sucesso sem persistir token ou link de recuperação',async()=>{
 const f=fixture(),a=await f.register();
 f.env.MAILER_URL='https://api.resend.com/emails';f.env.MAILER_TOKEN='mailer-test-secret';f.env.MAILER_FROM='Presença Confirmada <acesso@presencaconfirmada.com.br>';
 f.env.MAILER_FETCH=async()=>Response.json({id:'email-ok'});
 const r=await f.request('/api/auth/reset/request','POST',{email:a.user.email});assert.equal(r.status,200);
 const event=f.sql("SELECT * FROM integration_events WHERE provider='resend' ORDER BY created_at DESC LIMIT 1");assert.equal(event.status,'ok');assert.equal(event.studio_id,a.user.studio_id);
 const stored=JSON.stringify(event);assert.equal(stored.includes('mailer-test-secret'),false);assert.equal(stored.includes('/app/reset?token='),false);
});

test('Mercado Pago registra webhook processado sem alterar idempotência de créditos',async()=>{
 const f=fixture(),a=await f.register(),checkout=await f.request('/api/billing/checkout','POST',{plan:'credits_1'},a.cookie);
 f.resources.set('/v1/payments/901',approved(901,checkout.body.order_id,14.9));
 assert.equal((await f.webhook('payment','901')).status,200);assert.equal((await f.webhook('payment','901')).status,200);
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,1);
 assert.equal(f.sql("SELECT COUNT(*) n FROM integration_events WHERE provider='mercadopago' AND external_id='901' AND status='ok'").n,1);
});
