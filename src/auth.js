import { generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse } from '@simplewebauthn/server';
import { fail,now,id,token,b64,unb64,hash,stmt,one,all,run,body,text,slug,limit,audit,json } from './core.js';
export async function passwordHash(password,salt=token()) {
 text(password,256); if(password.length<8) fail(400,'Use uma senha com pelo menos 8 caracteres.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);
 return `${salt}.${b64(new Uint8Array(bits))}`;
}
export async function passwordOK(password,stored) { try { return await passwordHash(String(password),stored.split('.')[0])===stored; } catch { return false; } }
export const cookie = value => `rsvp_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
export async function newSession(env,user) {
 if(await one(env,'SELECT user_id FROM user_revocations WHERE user_id=?',user)) fail(403,'Acesso à equipe revogado.');
 await run(env,'DELETE FROM sessions WHERE expires_at<?',now());
 const raw=token(); await run(env,'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',await hash(raw),user,new Date(Date.now()+7*86400000).toISOString());
 return {'set-cookie':cookie(raw)};
}
export async function session(request,env) {
 const raw=request.headers.get('cookie')?.match(/(?:^|;\s*)rsvp_session=([^;]+)/)?.[1]; if(!raw) fail(401,'Entre na sua conta.');
 const u=await one(env,`SELECT u.id,u.studio_id,u.email,u.name,u.role,s.token_hash,s.impersonated_studio_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND NOT EXISTS(SELECT 1 FROM user_revocations r WHERE r.user_id=u.id)`,await hash(raw),now());
 if(!u) fail(401,'Sua sessão expirou.');
 u.real_studio_id=u.studio_id; u.studio_id=u.impersonated_studio_id||u.studio_id;
 if(u.studio_id) { u.studio=await one(env,'SELECT * FROM studios WHERE id=?',u.studio_id); if(u.studio?.status!=='active' && u.role!=='super_admin') fail(403,'Conta suspensa.'); }
 return u;
}
export function owner(u) { if(!['super_admin','studio_owner'].includes(u.role)) fail(403,'Acesso restrito à responsável.'); }
export function admin(u) { if(u.role!=='super_admin') fail(403,'Acesso restrito à administração.'); }
export async function authRoutes(request,env,path) {
 const m=request.method;
 if(path==='/api/auth/register' && m==='POST') {
  await limit(env,`register:${request.headers.get('cf-connecting-ip')||'local'}`,5);
  const b=await body(request),email=text(b.email,254).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'E-mail inválido.');
  const studio=id(),user=id(),created=now(),pw=await passwordHash(b.password);
  await env.DB.batch([
   stmt(env,'INSERT INTO studios(id,slug,name,whatsapp,created_at) VALUES(?,?,?,?,?)',studio,slug(b.slug),text(b.brand),text(b.whatsapp,40),created),
   stmt(env,'INSERT INTO users VALUES(?,?,?,?,?,?,?)',user,studio,email,text(b.name),pw,'studio_owner',created)
  ]);
  return json({ok:true},201,await newSession(env,user));
 }
 if(path==='/api/auth/login' && m==='POST') {
  await limit(env,`login:${request.headers.get('cf-connecting-ip')||'local'}`,10);
  const b=await body(request),u=await one(env,'SELECT * FROM users WHERE email=?',text(b.email,254).toLowerCase());
  if(!u||!await passwordOK(b.password,u.password_hash)) fail(401,'E-mail ou senha inválidos.');
  return json({ok:true},200,await newSession(env,u.id));
 }
 if(path==='/api/auth/logout' && m==='POST') {
  const u=await session(request,env); await run(env,'DELETE FROM sessions WHERE token_hash=?',u.token_hash);
  return json({ok:true},200,{'set-cookie':cookie('')+'; Max-Age=0'});
 }
 if(path==='/api/auth/me' && m==='GET') { const u=await session(request,env); delete u.token_hash; return json({user:u}); }
 if(path==='/api/auth/password' && m==='POST') {
  const u=await session(request,env),b=await body(request),stored=await one(env,'SELECT password_hash FROM users WHERE id=?',u.id);
  if(!await passwordOK(b.current_password,stored.password_hash)) fail(403,'Senha atual inválida.');
  await env.DB.batch([stmt(env,'UPDATE users SET password_hash=? WHERE id=?',await passwordHash(b.password),u.id),stmt(env,'DELETE FROM sessions WHERE user_id=?',u.id)]);
  return json({ok:true},200,await newSession(env,u.id));
 }
 if(path==='/api/auth/logout-all' && m==='POST') { const u=await session(request,env); await run(env,'DELETE FROM sessions WHERE user_id=?',u.id); return json({ok:true}); }
 if(path==='/api/team') {
  const u=await session(request,env); owner(u); if(!u.studio_id) fail(400,'Selecione uma conviteira.');
  if(m==='GET') return json({users:await all(env,'SELECT id,name,email,role,EXISTS(SELECT 1 FROM user_revocations r WHERE r.user_id=users.id) revoked FROM users WHERE studio_id=?',u.studio_id)});
  if(m==='POST') {
   const b=await body(request),email=text(b.email,254).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'E-mail inválido.');
   const userId=id(); await run(env,'INSERT INTO users VALUES(?,?,?,?,?,?,?)',userId,u.studio_id,email,text(b.name),await passwordHash(b.password),'studio_user',now());
   await audit(env,u.studio_id,u.id,'add_team_member',{user_id:userId}); return json({ok:true},201);
  }
 }
 if(path.startsWith('/api/team/') && m==='DELETE') {
  const u=await session(request,env); owner(u); const target=path.split('/').pop();
  await env.DB.batch([stmt(env,"INSERT OR IGNORE INTO user_revocations SELECT id,? FROM users WHERE id=? AND studio_id=? AND role='studio_user'",now(),target,u.studio_id),stmt(env,"DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE id=? AND studio_id=? AND role='studio_user')",target,u.studio_id),stmt(env,'INSERT INTO audit_logs VALUES(?,?,?,?,?,?)',id(),u.studio_id,u.id,'revoke_team_member',JSON.stringify({user_id:target}),now())]);
  return json({ok:true});
 }
 if(path==='/api/auth/reset/request' && m==='POST') {
  await limit(env,`reset:${request.headers.get('cf-connecting-ip')||'local'}`,5);
  const b=await body(request),u=await one(env,'SELECT id,email FROM users WHERE email=?',text(b.email,254).toLowerCase());
  if(u && env.MAILER_URL && env.MAILER_TOKEN) {
   const raw=token(),challenge=id(); await run(env,'INSERT INTO auth_challenges VALUES(?,?,?,?,?)',challenge,u.id,'reset',await hash(raw),new Date(Date.now()+1800000).toISOString());
   const res=await fetch(env.MAILER_URL,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${env.MAILER_TOKEN}`},body:JSON.stringify({to:u.email,subject:'Recuperar acesso RSVP',text:`${env.APP_ORIGIN}/app/reset?token=${raw}`})});
   if(!res.ok) { await run(env,'DELETE FROM auth_challenges WHERE id=?',challenge); fail(503,'Envio indisponível.'); }
  }
  return json({ok:true,message:'Se houver uma conta e o envio estiver configurado, você receberá um link.'});
 }
 if(path==='/api/auth/reset/complete' && m==='POST') {
  const b=await body(request),pw=await passwordHash(b.password);
  const c=await stmt(env,"DELETE FROM auth_challenges WHERE kind='reset' AND challenge=? AND expires_at>? RETURNING user_id",await hash(text(b.token,100)),now()).first();
  if(!c) fail(400,'Link inválido ou expirado.');
  await env.DB.batch([stmt(env,'UPDATE users SET password_hash=? WHERE id=?',pw,c.user_id),stmt(env,'DELETE FROM sessions WHERE user_id=?',c.user_id)]); return json({ok:true});
 }
 if(path==='/api/passkeys' && m==='GET') { const u=await session(request,env); return json({passkeys:await all(env,'SELECT id,label,created_at FROM passkeys WHERE user_id=?',u.id)}); }
 if(path.startsWith('/api/passkeys/') && m==='DELETE') { const u=await session(request,env); await run(env,'DELETE FROM passkeys WHERE id=? AND user_id=?',decodeURIComponent(path.split('/').pop()),u.id); return json({ok:true}); }
 if(path==='/api/passkeys/register/options' && m==='POST') {
  const u=await session(request,env),keys=await all(env,'SELECT id FROM passkeys WHERE user_id=?',u.id);
  await run(env,'DELETE FROM auth_challenges WHERE expires_at<?',now());
  const options=await generateRegistrationOptions({rpName:'RSVP Plataforma',rpID:env.RP_ID,userID:new TextEncoder().encode(u.id),userName:u.email,attestationType:'none',excludeCredentials:keys.map(k=>({id:k.id})),authenticatorSelection:{residentKey:'required',userVerification:'required'}});
  const challenge=id(); await run(env,'INSERT INTO auth_challenges VALUES(?,?,?,?,?)',challenge,u.id,'register',options.challenge,new Date(Date.now()+300000).toISOString());
  return json({options,challenge_id:challenge});
 }
 if(path==='/api/passkeys/authenticate/options' && m==='POST') {
  await limit(env,`passkey:${request.headers.get('cf-connecting-ip')||'local'}`,20);
  await run(env,'DELETE FROM auth_challenges WHERE expires_at<?',now());
  const options=await generateAuthenticationOptions({rpID:env.RP_ID,userVerification:'required'}),challenge=id();
  await run(env,'INSERT INTO auth_challenges VALUES(?,?,?,?,?)',challenge,null,'authenticate',options.challenge,new Date(Date.now()+300000).toISOString()); return json({options,challenge_id:challenge});
 }
 if(['/api/passkeys/register/verify','/api/passkeys/authenticate/verify'].includes(path) && m==='POST') {
  const b=await body(request),registration=path.includes('/register/'),u=registration?await session(request,env):null;
  const c=await stmt(env,'DELETE FROM auth_challenges WHERE id=? AND kind=? AND expires_at>? RETURNING *',text(b.challenge_id,100),registration?'register':'authenticate',now()).first();
  if(!c || (registration && c.user_id!==u.id)) fail(400,'Desafio inválido.');
  const expected={expectedChallenge:c.challenge,expectedOrigin:env.APP_ORIGIN,expectedRPID:env.RP_ID,requireUserVerification:true};
  let verification;
  try {
   if(registration) verification=await verifyRegistrationResponse({response:b.response,...expected});
   else {
    const key=await one(env,'SELECT * FROM passkeys WHERE id=?',text(b.response?.id,2048)); if(!key) fail(401,'Passkey inválida.');
    verification=await verifyAuthenticationResponse({response:b.response,...expected,credential:{id:key.id,publicKey:unb64(key.public_key),counter:key.counter,transports:JSON.parse(key.transports)}});
    if(verification.verified) {
     const updated=await run(env,'UPDATE passkeys SET counter=? WHERE id=? AND counter=?',verification.authenticationInfo.newCounter,key.id,key.counter);
     if(!updated.meta.changes) fail(409,'Tente entrar novamente.');
     return json({ok:true},200,await newSession(env,key.user_id));
    }
   }
  } catch { fail(401,'Não foi possível validar a passkey.'); }
  if(!verification?.verified) fail(401,'Passkey inválida.');
  const key=verification.registrationInfo.credential;
  await run(env,'INSERT INTO passkeys VALUES(?,?,?,?,?,?,?)',key.id,u.id,b64(key.publicKey),key.counter,JSON.stringify(key.transports||[]),text(b.label||'Meu dispositivo',80),now());
  return json({ok:true});
 }
 return null;
}
