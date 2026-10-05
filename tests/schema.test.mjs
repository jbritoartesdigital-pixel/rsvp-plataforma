import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
test('schema mantém associação composta e bloqueia cruzamento de membros/mídia',async()=>{
 const f=fixture(),a=await f.register(),b=await f.register('b');f.exec('UPDATE studios SET credits=1');
 const ea=(await f.request('/api/events','POST',{title:'A',slug:'a'},a.cookie)).body.event;
 const eb=(await f.request('/api/events','POST',{title:'B',slug:'b'},b.cookie)).body.event;
 await f.request(`/api/events/${ea.id}/guests`,'POST',{name:'Maria'},a.cookie);const guest=f.sql('SELECT id FROM guests WHERE event_id=?',ea.id);
 assert.throws(()=>f.exec('INSERT INTO guest_members(id,guest_id,event_id,name,person_type,attendance_status,qr_token,is_preapproved) VALUES(?,?,?,?,?,?,?,?)','cross',guest.id,eb.id,'Maria','adult','yes',null,1),/FOREIGN KEY/);
 assert.throws(()=>f.exec("INSERT INTO event_media(id,event_id,studio_id,object_key,mime_type,size_bytes,created_at,media_kind,original_name,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)",'media',ea.id,b.user.studio_id,'cross','image/png',1,new Date().toISOString(),'background_image',''),/FOREIGN KEY/);
 assert.equal(f.env.DB.db.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.equal(f.sql('PRAGMA integrity_check').integrity_check,'ok');
});
test('suspensão bloqueia API autenticada, RSVP público e check-in sem apagar histórico',async()=>{
 const f=fixture(),a=await f.register();f.exec('UPDATE studios SET credits=1 WHERE id=?',a.user.studio_id);
 const e=(await f.request('/api/events','POST',{title:'Festa',slug:'festa',checkin_mode:'family'},a.cookie)).body.event;
 const g=(await f.request('/api/public/marca-a/festa/rsvp','POST',{name:'Maria',response_status:'yes',members:[{name:'Maria'}]})).body.guest;
 f.exec("UPDATE studios SET status='suspended' WHERE id=?",a.user.studio_id);
 assert.equal((await f.request('/api/events','GET',null,a.cookie)).status,403);
 assert.equal((await f.request('/api/public/marca-a/festa')).status,404);
 assert.equal((await f.request(`/api/q/${g.qr_token}`)).status,403);
 assert.equal(f.sql('SELECT COUNT(*) n FROM events').n,1);
});
