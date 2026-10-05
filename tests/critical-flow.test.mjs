import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,approved} from './helpers.mjs';
import {periodEnd} from '../src/billing.js';
test('cadastro → checkout → créditos → evento → RSVP → check-in e revogação',async()=>{
 const f=fixture(),a=await f.register();
 const checkout=await f.request('/api/billing/checkout','POST',{plan:'credits_1'},a.cookie);assert.equal(checkout.status,200);
 const order=checkout.body.order_id;f.resources.set('/v1/payments/10',approved(10,order));
 assert.equal((await f.webhook('payment','10')).status,200);assert.equal((await f.webhook('payment','10')).status,200);
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,1);
 const created=await f.request('/api/events','POST',{title:'Festa',slug:'festa',checkin_mode:'family'},a.cookie);assert.equal(created.status,201);const e=created.body.event;
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,0);
 assert.equal((await f.request('/api/events','POST',{title:'Outra',slug:'outra'},a.cookie)).status,402);
 const rsvp=await f.request('/api/public/marca-a/festa/rsvp','POST',{name:'Maria',response_status:'yes',members:[{name:'Maria',person_type:'adult'},{name:'Pedro',person_type:'child'}]});assert.equal(rsvp.status,200);
 const g=rsvp.body.guest;assert.ok(g.qr_token);
 assert.equal((await f.request(`/api/events/${e.id}/checkins`,'POST',{token:g.qr_token},a.cookie)).body.already_checked_in,false);
 assert.equal((await f.request(`/api/events/${e.id}/checkins`,'POST',{token:g.qr_token},a.cookie)).body.already_checked_in,true);
 const cancel=await f.request('/api/public/marca-a/festa/rsvp','POST',{name:'Maria',token:g.token,response_status:'no',members:g.members.map(m=>({id:m.id,name:m.name,person_type:m.person_type}))});assert.equal(cancel.status,200);assert.equal(cancel.body.guest.qr_token,null);
 assert.equal((await f.request(`/api/q/${g.qr_token}`)).status,403);
 assert.equal((await f.request(`/api/events/${e.id}/checkins`,'POST',{token:g.qr_token},a.cookie)).status,403);
 assert.equal(f.sql('SELECT COUNT(*) n FROM checkins').n,1);
});
test('mensal: consulta authorized_payments; autorização sem fatura paga não libera evento',async()=>{
 const f=fixture(),a=await f.register();const checkout=await f.request('/api/billing/checkout','POST',{plan:'monthly'},a.cookie),order=f.sql('SELECT * FROM billing_orders WHERE id=?',checkout.body.order_id);
 assert.equal(checkout.status,200);f.resources.set(`/preapproval/${order.provider_id}`,{id:order.provider_id,external_reference:order.id,status:'authorized'});
 assert.equal((await f.webhook('subscription_preapproval',order.provider_id)).status,200);
 assert.equal((await f.request('/api/events','POST',{title:'Festa',slug:'festa'},a.cookie)).status,402);
 f.resources.set('/authorized_payments/200',{id:200,preapproval_id:order.provider_id,status:'processed',debit_date:new Date().toISOString(),payment:{id:201}});
 f.resources.set('/v1/payments/201',approved(201,order.id,29.9));
 assert.equal((await f.webhook('subscription_authorized_payment','200')).status,200);
 assert.equal((await f.webhook('subscription_authorized_payment','200')).status,200);
 assert.ok(f.calls.some(c=>c.path==='/authorized_payments/200'));
 assert.ok(!f.calls.some(c=>c.path==='/v1/payments/200'));
 assert.equal(f.sql('SELECT COUNT(*) n FROM subscription_invoices').n,1);
 for(const slug of ['mensal-1','mensal-2'])assert.equal((await f.request('/api/events','POST',{title:slug,slug},a.cookie)).status,201);
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,0);
});
test('troca mensal → créditos revoga mensal; webhook antigo não restaura entitlement',async()=>{
 const f=fixture(),a=await f.register(),c=await f.request('/api/billing/checkout','POST',{plan:'monthly'},a.cookie),order=f.sql('SELECT * FROM billing_orders WHERE id=?',c.body.order_id);
 f.resources.set(`/preapproval/${order.provider_id}`,{id:order.provider_id,external_reference:order.id,status:'authorized'});
 f.resources.set('/authorized_payments/20',{id:20,preapproval_id:order.provider_id,status:'processed',debit_date:new Date().toISOString(),payment:{id:21}});f.resources.set('/v1/payments/21',approved(21,order.id,29.9));await f.webhook('subscription_authorized_payment','20');
 const credits=await f.request('/api/billing/checkout','POST',{plan:'credits_1'},a.cookie);assert.equal(credits.status,200);
 assert.ok(f.calls.some(c=>c.method==='PUT'&&c.path===`/preapproval/${order.provider_id}`));
 assert.equal(f.sql('SELECT monthly_until FROM studios WHERE id=?',a.user.studio_id).monthly_until,null);
 await f.webhook('subscription_authorized_payment','20');assert.equal(f.sql('SELECT monthly_until FROM studios WHERE id=?',a.user.studio_id).monthly_until,null);
 assert.equal((await f.request('/api/events','POST',{title:'Sem crédito',slug:'sem'},a.cookie)).status,402);
 f.resources.set('/v1/payments/22',approved(22,credits.body.order_id));await f.webhook('payment','22');assert.equal((await f.request('/api/events','POST',{title:'Crédito',slug:'credito'},a.cookie)).status,201);
});
test('troca créditos → mensal preserva saldo mas não deixa saldo substituir mensal pendente',async()=>{
 const f=fixture(),a=await f.register();f.exec('UPDATE studios SET credits=5 WHERE id=?',a.user.studio_id);
 assert.equal((await f.request('/api/billing/checkout','POST',{plan:'monthly'},a.cookie)).status,200);
 assert.equal((await f.request('/api/events','POST',{title:'Sem mensal paga',slug:'sem'},a.cookie)).status,402);assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,5);
});
test('isolamento tenant em evento, convidados, check-in, marca e financeiro',async()=>{
 const f=fixture(),a=await f.register(),b=await f.register('b');f.exec('UPDATE studios SET credits=1 WHERE id=?',a.user.studio_id);
 const e=(await f.request('/api/events','POST',{title:'Privado',slug:'privado'},a.cookie)).body.event;
 for(const sub of ['', '/guests','/checkins'])assert.equal((await f.request(`/api/events/${e.id}${sub}`,'GET',null,b.cookie)).status,404);
 assert.equal((await f.request(`/api/events/${e.id}`,'PATCH',{title:'Ataque'},b.cookie)).status,404);
 assert.equal((await f.request('/api/admin/studios','GET',null,b.cookie)).status,403);
 assert.equal((await f.request('/api/billing','GET',null,b.cookie)).body.orders.length,0);
 assert.equal((await f.request('/api/auth/me','GET',null,b.cookie)).body.user.studio.id,b.user.studio_id);
});
test('estorno idempotente e fora de ordem não recria crédito; recebedor e valor validados',async()=>{
 const f=fixture(),a=await f.register(),c=await f.request('/api/billing/checkout','POST',{plan:'credits_1'},a.cookie),p=approved(40,c.body.order_id);
 f.resources.set('/v1/payments/40',{...p,collector_id:999});assert.equal((await f.webhook('payment','40')).status,400);
 f.resources.set('/v1/payments/40',{...p,transaction_amount:0.01});assert.equal((await f.webhook('payment','40')).status,400);
 f.resources.set('/v1/payments/40',p);await f.webhook('payment','40');
 f.resources.set('/v1/payments/40',{...p,status:'refunded',transaction_amount_refunded:9.9});await f.webhook('payment','40');await f.webhook('payment','40');
 f.resources.set('/v1/payments/40',p);await f.webhook('payment','40');
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,0);assert.equal(f.sql('SELECT COUNT(*) n FROM credit_ledger').n,2);
});
test('QR individual e triggers revogam presença no admin, SQL direto e desativação do evento',async()=>{
 const f=fixture(),a=await f.register();f.exec('UPDATE studios SET credits=1 WHERE id=?',a.user.studio_id);const e=(await f.request('/api/events','POST',{title:'Individual',slug:'individual',checkin_mode:'individual'},a.cookie)).body.event;
 const r=await f.request('/api/public/marca-a/individual/rsvp','POST',{name:'Maria',response_status:'yes',members:[{name:'Maria'},{name:'João'}]}),g=r.body.guest,m=g.members[0];
 assert.ok(m.qr_token);assert.equal((await f.request(`/api/q/${m.qr_token}`)).status,200);
 f.exec("UPDATE guest_members SET attendance_status='no' WHERE id=?",m.id);assert.equal(f.sql('SELECT qr_token FROM guest_members WHERE id=?',m.id).qr_token,null);
 assert.equal((await f.request(`/api/q/${m.qr_token}`)).status,403);
 const other=g.members[1];await f.request(`/api/events/${e.id}`,'PATCH',{status:'inactive'},a.cookie);assert.equal(f.sql('SELECT qr_token FROM guest_members WHERE id=?',other.id).qr_token,null);
 assert.equal((await f.request(`/api/q/${other.qr_token}`)).status,403);
});
test('eventos simultâneos consomem exatamente um crédito; rollback mantém schema íntegro',async()=>{
 const f=fixture(),a=await f.register();f.exec('UPDATE studios SET credits=1 WHERE id=?',a.user.studio_id);
 const results=await Promise.all(['a','b','c'].map(slug=>f.request('/api/events','POST',{title:slug,slug},a.cookie)));
 assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===402).length,2);
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,0);assert.equal(f.sql('SELECT COUNT(*) n FROM events').n,1);
 assert.equal(f.env.DB.db.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.throws(()=>f.exec("INSERT INTO guest_members VALUES('x','invalid','invalid','X','adult','yes',NULL)"),/FOREIGN KEY/);
});
test('CSRF, assinatura adulterada, sessão e passkey falsas são rejeitadas',async()=>{
 const f=fixture(),a=await f.register();assert.equal((await f.request('/api/billing/checkout','POST',{plan:'credits_1'},a.cookie,'https://evil.example')).status,403);
 assert.equal((await f.request('/api/events')).status,401);
 const r=await (await import('../src/index.js')).default.fetch(new Request('https://rsvp.example/api/webhooks/mercadopago?data.id=1',{method:'POST',headers:{'x-signature':'ts=1,v1=wrong','x-request-id':'fake'},body:JSON.stringify({type:'payment',data:{id:'2'}})}),f.env);assert.equal(r.status,401);
 const c=await f.request('/api/passkeys/register/options','POST',{},a.cookie);assert.equal(c.status,200);
 const invalid=await f.request('/api/passkeys/register/verify','POST',{challenge_id:c.body.challenge_id,response:{id:'fake'},label:'Fake'},a.cookie);assert.equal(invalid.status,401);
 assert.equal((await f.request('/api/passkeys/register/verify','POST',{challenge_id:c.body.challenge_id,response:{id:'fake'}},a.cookie)).status,400);
});
test('lista exige convite secreto; cliente não recebe token de resposta ou QR',async()=>{
 const f=fixture(),a=await f.register();f.exec('UPDATE studios SET credits=1 WHERE id=?',a.user.studio_id);const e=(await f.request('/api/events','POST',{title:'Lista',slug:'lista',rsvp_mode:'list'},a.cookie)).body.event;
 await f.request(`/api/events/${e.id}/guests`,'POST',{name:'Maria',max_people:2},a.cookie);const g=(await f.request(`/api/events/${e.id}/guests`,'GET',null,a.cookie)).body.guests[0];
 assert.equal((await f.request('/api/public/marca-a/lista/rsvp','POST',{name:'Maria',response_status:'yes',members:[{name:'Maria'}]})).status,403);
 assert.equal((await f.request('/api/public/marca-a/lista/rsvp','POST',{token:g.token,response_status:'yes',members:[{name:'Maria'}]})).status,200);
 const c=await f.request(`/api/cliente/${e.client_token}`);assert.equal(c.status,200);assert.equal(c.body.guests[0].token,undefined);assert.equal(c.body.guests[0].qr_token,undefined);
});
test('fim do período mensal usa calendário e não acrescenta tempo em webhook repetido',()=>{
 assert.equal(periodEnd('2026-01-31T12:00:00.000Z'),'2026-02-28T12:00:00.000Z');
 assert.equal(periodEnd('2028-01-31T12:00:00.000Z'),'2028-02-29T12:00:00.000Z');
 assert.equal(periodEnd('2026-01-31T12:00:00.000Z',3),'2026-03-03T12:00:00.000Z');
});
test('cancelamento remoto revoga geração e fatura atrasada não restaura mensal',async()=>{
 const f=fixture(),a=await f.register(),c=await f.request('/api/billing/checkout','POST',{plan:'monthly'},a.cookie),o=f.sql('SELECT * FROM billing_orders WHERE id=?',c.body.order_id);
 f.resources.set(`/preapproval/${o.provider_id}`,{id:o.provider_id,external_reference:o.id,status:'authorized'});
 f.resources.set('/authorized_payments/50',{id:50,preapproval_id:o.provider_id,status:'processed',debit_date:new Date().toISOString(),payment:{id:51}});f.resources.set('/v1/payments/51',approved(51,o.id,29.9));await f.webhook('subscription_authorized_payment','50');
 f.resources.set(`/preapproval/${o.provider_id}`,{id:o.provider_id,external_reference:o.id,status:'cancelled'});await f.webhook('subscription_preapproval',o.provider_id);
 assert.equal(f.sql('SELECT monthly_until FROM studios WHERE id=?',a.user.studio_id).monthly_until,null);
 f.resources.set(`/preapproval/${o.provider_id}`,{id:o.provider_id,external_reference:o.id,status:'authorized'});await f.webhook('subscription_authorized_payment','50');
 assert.equal(f.sql('SELECT monthly_until FROM studios WHERE id=?',a.user.studio_id).monthly_until,null);
});
test('estorno de pagamento mensal e evento depois do vencimento ficam bloqueados',async()=>{
 const f=fixture(),a=await f.register(),c=await f.request('/api/billing/checkout','POST',{plan:'monthly'},a.cookie),o=f.sql('SELECT * FROM billing_orders WHERE id=?',c.body.order_id);
 f.resources.set(`/preapproval/${o.provider_id}`,{id:o.provider_id,external_reference:o.id,status:'authorized'});f.resources.set('/authorized_payments/60',{id:60,preapproval_id:o.provider_id,status:'processed',debit_date:new Date().toISOString(),payment:{id:61}});f.resources.set('/v1/payments/61',approved(61,o.id,29.9));await f.webhook('subscription_authorized_payment','60');
 f.resources.set('/v1/payments/61',{...approved(61,o.id,29.9),status:'refunded'});await f.webhook('payment','61');assert.equal(f.sql('SELECT monthly_until FROM studios WHERE id=?',a.user.studio_id).monthly_until,null);
 assert.equal((await f.request('/api/events','POST',{title:'Estornado',slug:'estornado'},a.cookie)).status,402);
 f.exec("UPDATE studios SET monthly_until='2020-01-01T00:00:00.000Z' WHERE id=?",a.user.studio_id);assert.equal((await f.request('/api/events','POST',{title:'Vencido',slug:'vencido'},a.cookie)).status,402);
});
test('pagamento duplicado da mesma ordem não dobra saldo; estorno duplicado não retira crédito válido',async()=>{
 const f=fixture(),a=await f.register(),c=await f.request('/api/billing/checkout','POST',{plan:'credits_1'},a.cookie);
 for(const n of [70,71]){f.resources.set(`/v1/payments/${n}`,approved(n,c.body.order_id));await f.webhook('payment',String(n));}
 assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,1);
 f.resources.set('/v1/payments/71',{...approved(71,c.body.order_id),status:'refunded'});await f.webhook('payment','71');assert.equal(f.sql('SELECT credits FROM studios WHERE id=?',a.user.studio_id).credits,1);
});
test('reconfirmar gera QR novo e status pending também revoga; evento não aceita QR de outro',async()=>{
 const f=fixture(),a=await f.register();f.exec('UPDATE studios SET credits=2 WHERE id=?',a.user.studio_id);
 const events=[];for(const slug of ['um','dois'])events.push((await f.request('/api/events','POST',{title:slug,slug,checkin_mode:'family'},a.cookie)).body.event);
 const data={name:'Maria',response_status:'yes',members:[{name:'Maria'}]},g=(await f.request('/api/public/marca-a/um/rsvp','POST',data)).body.guest;
 assert.equal((await f.request(`/api/events/${events[1].id}/checkins`,'POST',{token:g.qr_token},a.cookie)).status,403);
 await f.request('/api/public/marca-a/um/rsvp','POST',{...data,token:g.token,response_status:'pending'});
 assert.equal((await f.request(`/api/q/${g.qr_token}`)).status,403);
 const g2=(await f.request('/api/public/marca-a/um/rsvp','POST',{...data,token:g.token})).body.guest;assert.ok(g2.qr_token);assert.notEqual(g2.qr_token,g.qr_token);
 assert.equal((await f.request(`/api/q/${g.qr_token}`)).status,403);
});
test('reset de senha revoga sessões; papel da equipe não permite checkout ou ajuste',async()=>{
 const f=fixture(),a=await f.register();
 const team=await f.request('/api/team','POST',{email:'team@example.com',name:'Equipe',password:'equipe-senha-longa'},a.cookie);assert.equal(team.status,201);
 const login=await f.request('/api/auth/login','POST',{email:'team@example.com',password:'equipe-senha-longa'});assert.equal(login.status,200);
 assert.equal((await f.request('/api/billing/checkout','POST',{plan:'credits_1'},login.cookie)).status,403);assert.equal((await f.request('/api/admin/studios','GET',null,login.cookie)).status,403);
 const {hash,token}=await import('../src/core.js'),raw=token();f.exec('INSERT INTO auth_challenges VALUES(?,?,?,?,?)','reset',a.user.id,'reset',await hash(raw),new Date(Date.now()+60000).toISOString());
 assert.equal((await f.request('/api/auth/reset/complete','POST',{token:raw,password:'nova-senha-segura-123'})).status,200);
 assert.equal((await f.request('/api/auth/me','GET',null,a.cookie)).status,401);assert.equal((await f.request('/api/auth/reset/complete','POST',{token:raw,password:'outra-senha-longa-123'})).status,400);
});
test('revogar equipe impede nova sessão e preserva usuário para histórico de auditoria',async()=>{
 const f=fixture(),a=await f.register();await f.request('/api/team','POST',{email:'team@example.com',name:'Equipe',password:'equipe-senha-longa'},a.cookie);
 const staff=f.sql('SELECT id FROM users WHERE email=?','team@example.com'),login=await f.request('/api/auth/login','POST',{email:'team@example.com',password:'equipe-senha-longa'});
 assert.equal((await f.request(`/api/team/${staff.id}`,'DELETE',{},a.cookie)).status,200);
 assert.equal((await f.request('/api/auth/me','GET',null,login.cookie)).status,401);
 assert.equal((await f.request('/api/auth/login','POST',{email:'team@example.com',password:'equipe-senha-longa'})).status,403);
 assert.ok(f.sql('SELECT id FROM users WHERE id=?',staff.id));
});
