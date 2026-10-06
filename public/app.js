import {startRegistration,startAuthentication} from '@simplewebauthn/browser';
import QRCode from 'qrcode';
const app=document.querySelector('#app');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>c?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100):'Em breve';
const labelStatus=value=>({
 active:'Ativo',inactive:'Inativo',archived:'Arquivado',
 pending:'Pendente',approved:'Aprovado',rejected:'Recusado',failed:'Falhou',cancelled:'Cancelado',
 refunded:'Estornado',charged_back:'Contestação',authorized:'Autorizado',
 in_process:'Em processamento',in_mediation:'Em mediação',
 yes:'Confirmado',no:'Não vai',monthly:'Mensal',credits:'Créditos',
 suspended:'Suspenso',paused:'Pausado'
}[String(value)]||String(value??''));
const field=(name,label,type='text',value='',required=true)=>{
 const min=(type==='password')?' minlength="8"':'';
 const auto=name==='email'?' autocomplete="email"':name==='whatsapp'||name==='phone'?' autocomplete="tel"':name==='name'?' autocomplete="name"':'';
 return `<label><span class="field-label">${label}${required?'<b class="required-mark" aria-hidden="true">*</b>':''}</span><input name="${name}" type="${type}" value="${escape(value)}" ${required?'required aria-required="true"':''}${min}${auto}></label>`;
};
const select=(name,label,items,value)=>`<label><span class="field-label">${label}<b class="required-mark" aria-hidden="true">*</b></span><select name="${name}" required aria-required="true">${items.map(([k,v])=>`<option value="${k}" ${k===value?'selected':''}>${v}</option>`).join('')}</select></label>`;
const form=(id,content,button)=>`<form id="${id}" class="form" novalidate><div class="form-alert" role="alert" hidden></div>${content}${/\srequired(?:\s|=|>)/.test(content)?'<p class="required-note"><span>*</span> Campos obrigatórios</p>':''}<button>${button}</button></form>`;
const notice=message=>{const el=document.querySelector('#notice');el.textContent=message;el.style.display='block';setTimeout(()=>el.style.display='none',6000);};
const api=async(path,method='GET',data)=>{
 const r=await fetch(path,{method,headers:data?{'content-type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});
 const b=await r.json();if(!r.ok) throw Error(b.error||'Não foi possível concluir.');return b;
};
function submit(id,fn) {
 document.querySelector(`#${id}`)?.addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.target,button=form.querySelector('button'),alert=form.querySelector('.form-alert');
  form.querySelectorAll('.field-error').forEach(el=>el.remove());
  form.querySelectorAll('.invalid').forEach(el=>el.classList.remove('invalid'));
  if(alert){alert.hidden=true;alert.textContent='';}
  if(!form.checkValidity()){
   const invalid=[...form.querySelectorAll('input,select,textarea')].filter(el=>!el.validity.valid);
   for(const el of invalid){
    el.classList.add('invalid');
    const label=el.closest('label');
    const title=label?.querySelector('.field-label')?.textContent?.replace('*','').trim()||'Este campo';
    let message=`${title} é obrigatório.`;
    if(el.validity.typeMismatch) message='Informe um e-mail válido.';
    else if(el.validity.tooShort) message=`${title} deve ter pelo menos ${el.minLength} caracteres.`;
    else if(el.validity.rangeUnderflow||el.validity.rangeOverflow) message=`Confira o valor informado em ${title.toLowerCase()}.`;
    const error=document.createElement('span');
    error.className='field-error';
    error.textContent=message;
    label?.append(error);
   }
   if(alert){alert.textContent='Confira os campos destacados antes de continuar.';alert.hidden=false;}
   invalid[0]?.focus();
   invalid[0]?.scrollIntoView({behavior:'smooth',block:'center'});
   return;
  }
  button.disabled=true;
  try {await fn(Object.fromEntries(new FormData(form)),form);}
  catch(err){notice(err.message);}
  finally{button.disabled=false;}
 });
}
function click(id,fn) {document.querySelector(`#${id}`)?.addEventListener('click',async e=>{e.preventDefault();try{await fn();}catch(err){notice(err.message);}});}
const RESERVED_SLUGS=new Set(['api','app','admin','q','cliente','planos','termos','privacidade','media']);
const cleanSlug=value=>{let v=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);if(RESERVED_SLUGS.has(v))v=(v+'-evento').slice(0,60);return v;};
function bindAutoSlug(sourceName,targetName,previewId){
 const source=document.querySelector(`[name="${sourceName}"]`),target=document.querySelector(`[name="${targetName}"]`),preview=document.querySelector(`#${previewId}`);
 if(!source||!target)return;
 let manual=false;
 const paint=()=>{if(preview)preview.textContent=target.value||'seu-endereco';};
 source.addEventListener('input',()=>{if(!manual){target.value=cleanSlug(source.value);paint();}});
 target.addEventListener('input',()=>{manual=true;target.value=cleanSlug(target.value);paint();});
 if(!target.value){target.value=cleanSlug(source.value);}
 paint();
}
const localToIso=value=>{
 if(!value)return '';
 const d=new Date(value);
 return Number.isFinite(d.getTime())?d.toISOString():value;
};
const toLocalInput=value=>{
 if(!value)return '';
 const d=new Date(value);
 if(!Number.isFinite(d.getTime()))return '';
 const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
 return local.toISOString().slice(0,16);
};
const formatDate=(value,time=false)=>{
 if(!value)return '';
 const d=new Date(value);
 if(!Number.isFinite(d.getTime()))return '';
 return new Intl.DateTimeFormat('pt-BR',time?{dateStyle:'short',timeStyle:'short'}:{dateStyle:'medium'}).format(d);
};
const statusTone=value=>['active','approved','yes','authorized'].includes(String(value))?'success':['pending','in_process','in_mediation','paused'].includes(String(value))?'warning':['inactive','archived','cancelled','failed','refunded','charged_back','rejected','no','suspended'].includes(String(value))?'danger':'neutral';
const ledgerLabel=value=>({purchase:'Compra de créditos',refund:'Estorno de créditos',event:'Evento criado'}[String(value)]||String(value??'Movimentação'));
function setShell(mode){
 document.body.dataset.shell=mode;
 const nav=document.querySelector('header nav');
 if(!nav)return;
 if(mode==='app')nav.innerHTML='<a href="/app">Painel</a>';
 else if(mode==='event')nav.innerHTML='';
 else nav.innerHTML='<a href="/planos">Planos</a><a class="nav-login" href="/app/login">Entrar</a>';
}
function jsonDate(value,time=''){
 if(!value)return '';
 const raw=String(value).trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
  const clock=/^\d{2}:\d{2}/.test(String(time))?String(time).slice(0,5):'12:00';
  return localToIso(`${raw}T${clock}`);
 }
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))return localToIso(raw);
 const d=new Date(raw);
 return Number.isFinite(d.getTime())?d.toISOString():'';
}
function normalizeEventJson(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('O JSON precisa ser um objeto de configuração.');
 const v=Number(raw.schema_version||1);if(![1,2].includes(v))throw Error('Versão de JSON não reconhecida.');
 const payload={};
 if(raw.title!==undefined)payload.title=String(raw.title).trim();
 if(raw.location!==undefined)payload.location=String(raw.location||'').trim();
 if(raw.welcome_message!==undefined)payload.welcome_message=String(raw.welcome_message||'').trim();
 const eventDate=jsonDate(raw.event_date,raw.event_time);if(eventDate)payload.event_date=eventDate;
 const deadline=jsonDate(raw.deadline||raw.rsvp_deadline);if(deadline)payload.deadline=deadline;
 if(['free','list'].includes(raw.rsvp_mode))payload.rsvp_mode=raw.rsvp_mode;
 if(['strict','flexible'].includes(raw.list_behavior))payload.list_behavior=raw.list_behavior;
 const max=Number(raw.max_people??raw.max_people_per_rsvp);if(Number.isInteger(max)&&max>=1&&max<=100)payload.max_people=max;
 if(['off','family','individual'].includes(raw.checkin_mode))payload.checkin_mode=raw.checkin_mode;
 if(['active','inactive','archived'].includes(raw.status))payload.status=raw.status;
 if(raw.extra_fields&&typeof raw.extra_fields==='object'&&!Array.isArray(raw.extra_fields)){payload.extra_fields={...raw.extra_fields};if(raw.extra_fields.love_message!==undefined&&raw.extra_fields.message===undefined)payload.extra_fields.message=!!raw.extra_fields.love_message;delete payload.extra_fields.love_message;}
 if(raw.public_texts&&typeof raw.public_texts==='object'&&!Array.isArray(raw.public_texts))payload.public_texts={...raw.public_texts};
 if(raw.client_permissions&&typeof raw.client_permissions==='object'&&!Array.isArray(raw.client_permissions))payload.client_permissions={...raw.client_permissions};
 const oldA=raw.appearance_settings&&typeof raw.appearance_settings==='object'?raw.appearance_settings:{},newA=raw.appearance&&typeof raw.appearance==='object'?raw.appearance:{};
 const appearance={...oldA,...newA};
 const primary=raw.primary_color||appearance.button_color||appearance.color;
 if(/^#[a-f0-9]{6}$/i.test(String(primary||''))){appearance.button_color=String(primary);appearance.color=String(primary);}
 if(/^#[a-f0-9]{6}$/i.test(String(raw.accent_color||''))&&!appearance.background_color)appearance.background_color=String(raw.accent_color);
 for(const mediaKey of ['background','background_url','background_image_url','background_video_url','cover_url','logo_url'])delete appearance[mediaKey];
 appearance.background_type='none';
 if(Object.keys(appearance).length)payload.appearance=appearance;
 const known=new Set(['schema_version','source','exported_at','title','location','welcome_message','event_date','event_time','deadline','rsvp_deadline','rsvp_mode','list_behavior','max_people','max_people_per_rsvp','checkin_mode','status','appearance','primary_color','accent_color','appearance_settings','extra_fields','public_texts','client_permissions','background_type','background_image_url','background_video_url']);
 const ignored=Object.keys(raw).filter(k=>!known.has(k));
 return {payload,ignored,version:v};
}
function exportEventJson(e){
 const appearance=parseObj(e.appearance),extra_fields={...DEFAULT_EXTRA_FIELDS,...parseObj(e.extra_fields)},public_texts=parseObj(e.public_texts),client_permissions={...DEFAULT_CLIENT_PERMISSIONS,...parseObj(e.client_permissions)};
 const cleanAppearance={...appearance};for(const k of ['background_url','cover_url','logo_url'])delete cleanAppearance[k];cleanAppearance.background_type='none';
 return {schema_version:2,source:'presenca-confirmada',exported_at:new Date().toISOString(),title:e.title,event_date:e.event_date||null,location:e.location||'',deadline:e.deadline||null,rsvp_mode:e.rsvp_mode||'free',list_behavior:e.list_behavior||'strict',max_people:Number(e.max_people||10),checkin_mode:e.checkin_mode||'off',status:e.status||'active',appearance:cleanAppearance,extra_fields,public_texts,client_permissions,welcome_message:e.welcome_message||''};
}
function downloadJson(filename,data){
 const a=document.createElement('a');
 a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json;charset=utf-8'}));
 a.download=filename;
 a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function jsonSummary(payload,ignored=[]){
 const rows=[['Evento',payload.title],['Data',payload.event_date?formatDate(payload.event_date,true):''],['Local',payload.location],['Prazo',payload.deadline?formatDate(payload.deadline,true):''],['Confirmação',payload.rsvp_mode==='list'?'Lista por família':payload.rsvp_mode==='free'?'Link livre':''],['Lista',payload.list_behavior==='flexible'?'Flexível':payload.list_behavior==='strict'?'Fechada':''],['Limite por convite',payload.max_people],['Check-in',payload.checkin_mode?({off:'Desativado',family:'Por família',individual:'Por pessoa'}[payload.checkin_mode]):''],['Idioma',payload.appearance?.interface_language],['Cor',payload.appearance?.button_color||payload.appearance?.color],['Campos opcionais',payload.extra_fields?Object.keys(payload.extra_fields).filter(k=>payload.extra_fields[k]).join(', '):''],['Textos',payload.public_texts?Object.keys(payload.public_texts).length+' personalizado(s)':''],['Mensagem',payload.welcome_message]].filter(([,v])=>v!==undefined&&v!==null&&v!=='');
 return `<div class="json-summary">${rows.map(([k,v])=>`<div><span>${escape(k)}</span><strong>${escape(v)}</strong></div>`).join('')}</div>${ignored.length?`<p class="json-ignored">Campos antigos sem equivalente comercial: ${escape(ignored.join(', '))}.</p>`:''}<p class="json-note">Mídias antigas não são importadas por URL. Envie-as novamente na biblioteca do evento.</p>`;
}
function closeJsonModal(){document.querySelector('#json-modal')?.remove();document.body.classList.remove('modal-open');}
function openJsonImport(eventId=null,currentEvent=null,done=null){
 closeJsonModal();
 const wrap=document.createElement('div');
 wrap.id='json-modal';wrap.className='modal-backdrop';
 wrap.innerHTML=`<div class="json-modal" role="dialog" aria-modal="true" aria-labelledby="json-title"><button class="modal-close" type="button" aria-label="Fechar">×</button><span class="eyebrow">${eventId?'Evento atual':'Novo evento'}</span><h2 id="json-title">${eventId?'Importar configuração JSON':'Criar evento por JSON'}</h2><p class="muted">${eventId?'Somente os campos presentes serão alterados. Convidados, respostas e links continuam intactos.':'Compatível com o JSON exportado pelo Libri RSVP original e pelo Presença Confirmada.'}</p><label><span class="field-label">Arquivo JSON</span><input id="json-file" type="file" accept="application/json,.json"></label><label><span class="field-label">Ou cole o JSON</span><textarea id="json-text" rows="11" placeholder='{ "schema_version": 1, "title": "..." }'></textarea></label><button class="secondary full-button" id="json-review" type="button">Revisar configuração</button><div id="json-preview"></div></div>`;
 document.body.append(wrap);document.body.classList.add('modal-open');
 wrap.querySelector('.modal-close').onclick=closeJsonModal;
 wrap.addEventListener('click',e=>{if(e.target===wrap)closeJsonModal();});
 const file=wrap.querySelector('#json-file'),text=wrap.querySelector('#json-text'),preview=wrap.querySelector('#json-preview');
 file.addEventListener('change',async()=>{const selected=file.files?.[0];if(selected){if(selected.size>250000){notice('O JSON deve ter até 250 KB.');file.value='';return;}text.value=await selected.text();preview.innerHTML='';}});
 wrap.querySelector('#json-review').onclick=()=>{
  try{
   const parsed=JSON.parse(text.value.trim()),{payload,ignored}=normalizeEventJson(parsed);
   if(!eventId&&!payload.title)throw Error('Para criar um evento, o JSON precisa ter o campo title.');
   preview.innerHTML=`<div class="json-review-card"><h3>Revisão</h3>${jsonSummary(payload,ignored)}<p class="json-note">${eventId?'O que não estiver no JSON será preservado.':'O evento será criado sem convidados e consumirá 1 crédito, ou usará sua mensalidade vigente.'}</p><button id="json-apply" class="full-button" type="button">${eventId?'Aplicar neste evento':'Criar evento'}</button></div>`;
   preview.querySelector('#json-apply').onclick=async e=>{
    const button=e.currentTarget;button.disabled=true;
    try{
     if(eventId){
      const update={...payload};
      if(update.appearance&&currentEvent){const currentAppearance=JSON.parse(currentEvent.appearance||'{}');update.appearance={...currentAppearance,...update.appearance};}
      await api(`/api/events/${eventId}`,'PATCH',update);
      closeJsonModal();notice('Configuração JSON aplicada.');if(done)await done();
     }else{
      const body={...payload,slug:cleanSlug(payload.title),rsvp_mode:payload.rsvp_mode||'free',max_people:payload.max_people||10,checkin_mode:payload.checkin_mode||'off'};
      try{
       const {event}=await api('/api/events','POST',body);closeJsonModal();goto(`/app/eventos/${event.id}`);
      }catch(err){
       if(/já existe/i.test(err.message)){body.slug=`${cleanSlug(payload.title)}-${Date.now().toString(36).slice(-4)}`;const {event}=await api('/api/events','POST',body);closeJsonModal();goto(`/app/eventos/${event.id}`);}
       else throw err;
      }
     }
    }catch(err){notice(err.message);button.disabled=false;}
   };
  }catch(err){preview.innerHTML='';notice(err.message||'JSON inválido.');}
 };
}
const goto=path=>{location.href=path;};
let user;

const menu=()=>{
 const p=location.pathname;
 const item=(href,label,active)=>`<a class="${active?'active':''}" href="${href}">${label}</a>`;
 const pureAdmin=user?.role==='super_admin'&&!user?.impersonated_studio_id;
 if(pureAdmin)return `<div class="app-nav-wrap admin-nav-wrap"><nav class="app-tabs admin-tabs" aria-label="Navegação administrativa">${item('/admin','Admin',p==='/admin')}${item('/admin/conta','Meu acesso',p==='/admin/conta')}<button id="logout" class="nav-logout">Sair</button></nav></div>`;
 return `<div class="app-nav-wrap"><nav class="app-tabs" aria-label="Navegação da plataforma">
  ${item('/app','Eventos',p==='/app'||p.startsWith('/app/eventos'))}
  ${item('/app/financeiro','Financeiro',p==='/app/financeiro')}
  ${item('/app/marca','Marca',p==='/app/marca')}
  ${item('/app/conta','Conta',p==='/app/conta')}
  <button id="logout" class="nav-logout">Sair</button>
 </nav></div>${user?.impersonated_studio_id?`<div class="impersonation"><div><strong>Modo suporte</strong><span>Você está acessando a conta ${escape(user.studio?.name||'selecionada')} como Super Admin.</span></div><button id="stop-impersonation">Voltar ao Admin</button></div>`:''}`;
};
function menuEvents(){click('logout',async()=>{await api('/api/auth/logout','POST',{});goto('/app/login');});click('stop-impersonation',async()=>{await api('/api/admin/impersonate','POST',{});goto('/admin');});}
async function plans(inApp=false){
 const {plans}=await api('/api/plans');
 const meta={
  credits_1:{badge:'Avulso',note:'Para testar ou atender um evento pontual.'},
  credits_5:{badge:'Economize',note:'Bom equilíbrio para uma agenda recorrente.'},
  credits_10:{badge:'Melhor por evento',note:'Para quem já atende várias festas por mês.'},
  monthly:{badge:'Mais simples',note:'Eventos ilimitados enquanto a mensalidade estiver vigente.'}
 };
 const cards=plans.map(p=>{const m=meta[p.key]||{};return `<article class="plan-card ${p.kind==='monthly'?'plan-featured':''}"><div class="plan-top"><span class="plan-badge">${m.badge||''}</span><span class="plan-type">${p.kind==='monthly'?'MENSAL':'CRÉDITOS'}</span></div><h2>${p.kind==='monthly'?'Eventos ilimitados':`${p.quantity} evento${p.quantity>1?'s':''}`}</h2><p class="plan-price">${money(p.amount_cents)}${p.kind==='monthly'?'<small>/mês</small>':''}</p><p class="plan-note">${m.note||''}</p>${p.amount_cents?`<button class="plan-cta" data-plan="${p.key}">${inApp?'Contratar':'Escolher plano'}</button>`:'<p class="muted">Preço ainda não definido</p>'}</article>`;}).join('');
 return `<div class="plans-grid">${cards}</div>`;
}
function bindPlans(inApp){document.querySelectorAll('[data-plan]').forEach(button=>button.addEventListener('click',async()=>{if(!inApp){goto(`/app/cadastro?plan=${button.dataset.plan}`);return;}button.disabled=true;try{const b=await api('/api/billing/checkout','POST',{plan:button.dataset.plan});goto(b.checkout_url);}catch(e){notice(e.message);button.disabled=false;}}));}
async function landing(){app.innerHTML=`<section class="landing-hero"><div class="hero-copy"><span class="hero-kicker">RSVP PROFISSIONAL PARA CONVITEIRAS</span><h1>Confirmação de presença sem planilha, sem caça ao WhatsApp.</h1><p class="hero-lead">Crie eventos com a sua identidade, organize famílias e respostas e acompanhe tudo em um painel feito para quem trabalha com convites.</p><div class="hero-actions"><a class="button primary" href="/app/cadastro">Criar minha conta</a><a class="button ghost" href="/planos">Ver planos</a></div><div class="hero-points"><span>✓ Sua marca</span><span>✓ QR opcional</span><span>✓ Créditos ou mensal</span></div></div><aside class="product-preview" aria-label="Resumo dos recursos da plataforma"><div class="preview-head"><span>Presença Confirmada</span><span class="status-dot">online</span></div><div class="preview-event"><small>EVENTO</small><strong>15 anos da Clara</strong><span>18 de outubro</span></div><div class="preview-stats"><div><strong>86</strong><span>confirmados</span></div><div><strong>12</strong><span>pendentes</span></div><div><strong>74</strong><span>check-ins</span></div></div><div class="preview-line"><span>Lista organizada</span><b>✓</b></div><div class="preview-line"><span>Check-in por QR</span><b>✓</b></div></aside></section><section class="landing-section"><div class="section-heading"><span class="hero-kicker">MENOS OPERAÇÃO, MAIS ENTREGA</span><h2>O RSVP vira parte do seu serviço, não mais uma tarefa paralela.</h2></div><div class="feature-grid"><article class="feature-card"><span class="feature-icon">01</span><h3>Sua identidade</h3><p>Cada evento ganha um endereço próprio e pode seguir a marca da sua empresa.</p></article><article class="feature-card"><span class="feature-icon">02</span><h3>Famílias organizadas</h3><p>Respostas, acompanhantes e mensagens ficam reunidos no mesmo lugar.</p></article><article class="feature-card"><span class="feature-icon">03</span><h3>Entrada opcional</h3><p>Ative check-in por QR quando o evento precisar, sem complicar os demais.</p></article></div></section><section class="home-cta"><div><span class="hero-kicker">COMECE DO SEU JEITO</span><h2>Evento avulso ou mensal ilimitado.</h2></div><a class="button primary" href="/planos">Comparar planos</a></section>`;}

async function authPage(path){
 if(path==='/app/cadastro'){
  const registrationFields=`<div class="form-section"><div class="form-section-head"><span>1</span><div><h2>Sua marca</h2><p>É assim que seus clientes vão reconhecer sua plataforma.</p></div></div>${field('brand','Nome da sua marca')}<label><span class="field-label">Endereço da sua marca<b class="required-mark" aria-hidden="true">*</b></span><input name="slug" required aria-required="true" autocapitalize="none" spellcheck="false"><small class="field-hint">Seu link: app.presencaconfirmada.com.br/<strong id="brand-url-preview">seu-endereco</strong></small></label></div><div class="form-section"><div class="form-section-head"><span>2</span><div><h2>Seu acesso</h2><p>Dados para entrar e receber informações da conta.</p></div></div>${field('name','Seu nome')}${field('whatsapp','WhatsApp','tel')}${field('email','E-mail','email')}${field('password','Senha · mínimo de 8 caracteres','password')}</div><p class="legal-copy">Ao continuar, você concorda com os <a href="/termos">termos</a> e a <a href="/privacidade">privacidade</a>.</p>`;
  app.innerHTML=`<div class="auth-layout"><section class="flow-intro"><span class="eyebrow">Primeiro acesso</span><h1>Crie sua conta em poucos passos</h1><p>Depois você escolhe o plano. Nenhuma cobrança acontece nesta tela.</p></section><div class="card setup-card">${form('register',registrationFields,'Criar minha conta')}</div></div>`;
  bindAutoSlug('brand','slug','brand-url-preview');
  submit('register',async b=>{await api('/api/auth/register','POST',b);goto('/app/financeiro');});return;
 }
 if(path==='/app/reset') {
  const raw=new URL(location.href).searchParams.get('token');
  app.innerHTML=`<div class="auth-layout narrow"><section class="flow-intro"><span class="eyebrow">Acesso</span><h1>Recuperar conta</h1><p>${raw?'Crie uma nova senha para voltar à plataforma.':'Informe o e-mail usado no cadastro.'}</p></section><div class="card auth-card">${raw?form('reset',field('password','Nova senha · mínimo de 8 caracteres','password'),'Salvar nova senha'):form('reset',field('email','E-mail','email'),'Enviar link de recuperação')}</div></div>`;
  submit('reset',async b=>{const result=await api(raw?'/api/auth/reset/complete':'/api/auth/reset/request','POST',raw?{...b,token:raw}:b);notice(result.message||'Senha alterada.');if(raw)goto('/app/login');});return;
 }
 app.innerHTML=`<div class="auth-layout narrow"><section class="flow-intro"><span class="eyebrow">Área da profissional</span><h1>Bem-vinda de volta</h1><p>Entre para gerenciar seus eventos, confirmações e pagamentos.</p></section><div class="card auth-card">${form('login',field('email','E-mail','email')+field('password','Senha','password'),'Entrar')}<div class="auth-separator"><span>ou</span></div><button class="secondary full-button" id="passkey-login">Entrar com digital / Face ID</button><div class="auth-links"><a href="/app/reset">Esqueci minha senha</a><a href="/app/cadastro">Criar conta</a></div></div></div>`;
 submit('login',async b=>{await api('/api/auth/login','POST',b);goto('/app');});
 click('passkey-login',async()=>{const x=await api('/api/passkeys/authenticate/options','POST',{});const response=await startAuthentication({optionsJSON:x.options});await api('/api/passkeys/authenticate/verify','POST',{challenge_id:x.challenge_id,response});goto('/app');});
}

const PUBLIC_TEXTS={
 'pt-BR':{
  eyebrow:'Confirmação de presença',
  intro:'Confirme sua presença para que tudo seja preparado com carinho.',
  yes_button:'Sim, estarei presente!',
  no_button:'Não poderei comparecer',
  success_title:'Presença confirmada!',
  success_message:'Que bom ter você com a gente. 💛',
  decline_title:'Resposta registrada',
  decline_message:'Obrigada por avisar.',
  message_label:'Deixe uma mensagem',
  message_placeholder:'Uma mensagem especial para quem está celebrando...',
  name_label:'Qual é o seu nome?',
  decline_hint:'Tudo bem 💛 Se quiser, você ainda pode deixar uma mensagem.',
  calendar_button:'Adicionar à agenda',
  back_button:'Voltar ao convite',
  closed_title:'Confirmações encerradas'
 },
 en:{
  eyebrow:'RSVP',
  intro:'Please confirm your attendance so everything can be prepared with care.',
  yes_button:"Yes, I'll be there!",
  no_button:"I won't be able to attend",
  success_title:'Attendance confirmed!',
  success_message:"We're so happy you'll be there. 💛",
  decline_title:'Response received',
  decline_message:'Thank you for letting us know.',
  message_label:'Leave a message',
  message_placeholder:'A special message for the celebration...',
  name_label:'What is your name?',
  decline_hint:"That's okay 💛 You can still leave a message if you want.",
  calendar_button:'Add to calendar',
  back_button:'Back to invitation',
  closed_title:'RSVP closed'
 }
};
const DEFAULT_APPEARANCE={
 color:'#a66f73',background_color:'#fcf8f7',card_color:'#ffffff',text_color:'#2f292b',
 muted_color:'#786f71',button_color:'#a66f73',button_text_color:'#ffffff',
 overlay_color:'#ffffff',overlay_opacity:.78,card_opacity:.96,card_blur:10,card_radius:22,
 font_style:'modern',card_style:'soft',background_position:'center',background_x:'center',card_width:'medium',
 interface_language:'pt-BR',invitation_url:'',calendar_location:'',calendar_end_time:'',
 background_type:'none',background_url:'',cover_url:'',logo_url:''
};
const DEFAULT_EXTRA_FIELDS={phone:true,dietary:true,notes:false,message:true};
const DEFAULT_CLIENT_PERMISSIONS={view:true,manage_guests:false,manage_appearance:false,manage_texts:false,view_messages:true,export_guests:true,manage_event_details:false};
const parseObj=(value,fallback={})=>{try{const x=typeof value==='string'?JSON.parse(value):value;return x&&typeof x==='object'&&!Array.isArray(x)?x:fallback;}catch{return fallback;}};
const eventAppearance=e=>{const raw=parseObj(e?.appearance),a={...DEFAULT_APPEARANCE,...raw};if(raw.color&&!raw.button_color)a.button_color=raw.color;if(raw.background&&!raw.background_url&&/^\/media\/[a-f0-9-]+$/i.test(raw.background)){a.background_url=raw.background;a.background_type='image';}return a;};
const eventExtra=e=>({...DEFAULT_EXTRA_FIELDS,...parseObj(e?.extra_fields)});
const eventTexts=e=>({...PUBLIC_TEXTS[eventAppearance(e).interface_language==='en'?'en':'pt-BR'],...parseObj(e?.public_texts)});
const eventLang=e=>eventAppearance(e).interface_language==='en'?'en':'pt-BR';
const ptr=(e,pt,en)=>eventLang(e)==='en'?en:pt;
const safeMedia=value=>/^\/media\/[a-f0-9-]+$/i.test(String(value||''))?String(value):'';
const safeHref=value=>{try{const u=new URL(String(value||''),location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const normalizedName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

const guestSourceLabel=value=>({public:'Convidado',client:'Cliente',admin:'Painel',import:'Importação'}[String(value)]||'Painel');
function markDuplicates(guests){
 const groups=new Map(),result=guests.map(g=>({...g,possible_duplicate:false,suggested_keep:false}));
 for(const g of result){const k=normalizedName(g.name);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(g);}
 for(const group of groups.values())if(group.length>1){
  group.sort((a,b)=>{const ar=a.responded_at?0:1,br=b.responded_at?0:1;if(ar!==br)return ar-br;return String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id));});
  group.forEach((g,i)=>{g.possible_duplicate=true;g.suggested_keep=i===0;});
 }
 return result;
}
function openModal(title,body,subtitle=''){
 document.querySelector('#pc-modal')?.remove();
 const wrap=document.createElement('div');wrap.id='pc-modal';wrap.className='modal-backdrop';
 wrap.innerHTML=`<div class="json-modal pc-modal"><button class="modal-close" aria-label="Fechar">×</button><h2>${escape(title)}</h2>${subtitle?`<p class="muted">${escape(subtitle)}</p>`:''}${body}</div>`;
 document.body.append(wrap);document.body.classList.add('modal-open');
 const close=()=>{wrap.remove();document.body.classList.remove('modal-open');};
 wrap.querySelector('.modal-close').onclick=close;wrap.onclick=e=>{if(e.target===wrap)close();};wrap.closeModal=close;return wrap;
}
function publicError(message,e){
 if(eventLang(e)!=='en')return message;
 const map={'Confirmações encerradas.':'RSVP is closed.','Convite inválido.':'Invalid invitation link.','Conclua a verificação de segurança.':'Complete the security check.','Verificação de segurança inválida. Tente novamente.':'Security check failed. Please try again.','Este convite não permite adicionar novas pessoas.':'This invitation does not allow adding new guests.'};
 return map[message]||message;
}
let turnstileLoader;
function ensureTurnstile(){
 if(globalThis.turnstile?.render)return Promise.resolve(globalThis.turnstile);
 if(turnstileLoader)return turnstileLoader;
 turnstileLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
  script.onload=()=>globalThis.turnstile?.render?resolve(globalThis.turnstile):reject(Error('Turnstile indisponível.'));
  script.onerror=()=>reject(Error('Não foi possível carregar a verificação de segurança.'));
  document.head.append(script);
 });
 return turnstileLoader;
}
async function mountTurnstile(form,sitekey){
 if(!sitekey||!form)return;
 const hidden=document.createElement('input');hidden.type='hidden';hidden.name='turnstile_token';form.append(hidden);
 const box=document.createElement('div');box.className='turnstile-box';form.insertBefore(box,form.querySelector('button'));
 try{await ensureTurnstile();form._turnstileWidget=turnstile.render(box,{sitekey,callback:value=>{hidden.value=value;},'expired-callback':()=>{hidden.value='';}});}
 catch(err){box.textContent=err.message;box.classList.add('turnstile-error');}
}
function resetTurnstile(form){if(form?._turnstileWidget!==undefined&&globalThis.turnstile?.reset)turnstile.reset(form._turnstileWidget);}
function eventCalendar(e){
 if(!e.event_date)return null;
 const a=eventAppearance(e),start=new Date(e.event_date);if(!Number.isFinite(start.getTime()))return null;
 let end=new Date(start.getTime()+4*60*60*1000);
 if(a.calendar_end_time){const local=new Date(start),parts=a.calendar_end_time.split(':').map(Number),hh=parts[0],mm=parts[1];if(Number.isFinite(hh)&&Number.isFinite(mm)){end=new Date(local);end.setHours(hh,mm,0,0);if(end<=start)end.setDate(end.getDate()+1);}}
 const compact=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),location=a.calendar_location||e.location||'',description=a.invitation_url?`${ptr(e,'Convite','Invitation')}: ${a.invitation_url}`:'';
 return {start:compact(start),end:compact(end),location,description};
}
function openCalendarMenu(e){
 const range=eventCalendar(e);if(!range){notice(ptr(e,'Este evento ainda não tem data configurada.','This event does not have a date yet.'));return;}
 const google=`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${range.start}%2F${range.end}&location=${encodeURIComponent(range.location)}&details=${encodeURIComponent(range.description)}`;
 const modal=openModal(ptr(e,'Adicionar à agenda','Add to calendar'),`<div class="calendar-actions"><a class="button full-button" target="_blank" rel="noopener" href="${escape(google)}">Google Calendar</a><button class="secondary full-button" id="download-ics">Apple / Outlook (.ics)</button></div>`);
 modal.querySelector('#download-ics').onclick=()=>{
  const escIcs=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const ics=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Presenca Confirmada//RSVP//PT-BR\r\nBEGIN:VEVENT\r\nUID:${crypto.randomUUID()}@presencaconfirmada\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}\r\nDTSTART:${range.start}\r\nDTEND:${range.end}\r\nSUMMARY:${escIcs(e.title)}\r\nLOCATION:${escIcs(range.location)}\r\nDESCRIPTION:${escIcs(range.description)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));link.download=`${cleanSlug(e.title)||'evento'}.ics`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
 };
}
function parseMemberLines(value){
 return String(value||'').split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{const parts=line.split(';').map(x=>x?.trim()),name=parts[0],type=parts[1],status=parts[2];return {name,person_type:/crian|child/i.test(type||'')?'child':'adult',attendance_status:/não|nao|no/i.test(status||'')?'no':/pend/i.test(status||'')?'pending':'yes'};});
}
function mediaUrl(id){return `/media/${id}`;}
function appearanceFields(a){
 const number=(name,label,value,min,max,step)=>\`<label><span class="field-label">\${label}</span><input name="\${name}" type="number" min="\${min}" max="\${max}" step="\${step}" value="\${escape(value)}"></label>\`;
 return \`<div class="appearance-editor-sections">
  <section class="appearance-group">
   <div class="appearance-group-head"><span>01</span><div><strong>Fundo</strong><small>Cor, posição e sobreposição da mídia.</small></div></div>
   <div class="settings-grid">
    \${field('background_color','Cor do fundo','color',a.background_color,false)}
    \${field('overlay_color','Cor da sobreposição','color',a.overlay_color,false)}
    \${select('background_position','Posição vertical',[['center','Centro'],['top','Topo'],['bottom','Base']],a.background_position)}
    \${select('background_x','Posição horizontal',[['left','Esquerda'],['center','Centro'],['right','Direita']],a.background_x)}
    \${number('overlay_opacity','Opacidade da sobreposição',a.overlay_opacity,0,1,.05)}
   </div>
  </section>
  <section class="appearance-group">
   <div class="appearance-group-head"><span>02</span><div><strong>Card do RSVP</strong><small>Cores, transparência e formato do cartão.</small></div></div>
   <div class="settings-grid">
    \${field('card_color','Cor do cartão','color',a.card_color,false)}
    \${field('text_color','Cor do texto','color',a.text_color,false)}
    \${field('muted_color','Texto secundário','color',a.muted_color,false)}
    \${field('button_color','Cor principal / botão','color',a.button_color||a.color,false)}
    \${field('button_text_color','Texto do botão','color',a.button_text_color,false)}
    \${select('card_style','Estilo do cartão',[['soft','Suave'],['glass','Translúcido'],['solid','Sólido']],a.card_style)}
    \${select('card_width','Largura do cartão',[['narrow','Estreito'],['medium','Médio'],['wide','Largo']],a.card_width)}
    \${number('card_opacity','Opacidade do cartão',a.card_opacity,0.55,1,.05)}
    \${number('card_blur','Desfoque do cartão',a.card_blur,0,30,1)}
    \${number('card_radius','Arredondamento',a.card_radius,0,40,1)}
   </div>
  </section>
  <section class="appearance-group">
   <div class="appearance-group-head"><span>03</span><div><strong>Tipografia e idioma</strong><small>Estilo visual e idioma do convidado.</small></div></div>
   <div class="settings-grid">
    \${select('font_style','Tipografia',[['modern','Moderna'],['elegant','Elegante'],['friendly','Infantil suave']],a.font_style)}
    \${select('interface_language','Idioma do convidado',[['pt-BR','Português'],['en','English']],a.interface_language)}
   </div>
  </section>
  <section class="appearance-group">
   <div class="appearance-group-head"><span>04</span><div><strong>Convite e agenda</strong><small>Links usados depois da confirmação.</small></div></div>
   \${field('invitation_url','Link do convite para voltar · opcional','url',a.invitation_url||'',false)}
   <div class="settings-grid">
    \${field('calendar_location','Local / endereço para agenda · opcional','text',a.calendar_location||'',false)}
    \${field('calendar_end_time','Horário de término · opcional','time',a.calendar_end_time||'',false)}
   </div>
  </section>
 </div>
 <input type="hidden" name="background_type" value="\${escape(a.background_type||'none')}">
 <input type="hidden" name="background_url" value="\${escape(a.background_url||'')}">
 <input type="hidden" name="cover_url" value="\${escape(a.cover_url||'')}">
 <input type="hidden" name="logo_url" value="\${escape(a.logo_url||'')}">\`;
}
function collectAppearance(formEl,current){
 const fd=new FormData(formEl),a={...current};
 for(const key of ['button_color','button_text_color','background_color','card_color','text_color','muted_color','overlay_color','card_style','card_width','font_style','background_position','background_x','interface_language','invitation_url','calendar_location','calendar_end_time','background_type','background_url','cover_url','logo_url'])if(fd.has(key))a[key]=fd.get(key);
 for(const key of ['overlay_opacity','card_opacity','card_blur','card_radius'])if(fd.has(key))a[key]=Number(fd.get(key));
 a.color=a.button_color;return a;
}
function bindAppearancePreview(previewId,formEl,e,baseAppearance,texts=eventTexts(e),stateId=''){
 const box=document.querySelector(`#${previewId}`),state=stateId?document.querySelector(`#${stateId}`):null;if(!box||!formEl)return;
 const render=()=>{
  const a=collectAppearance(formEl,baseAppearance),media=safeMedia(a.background_url),logo=safeMedia(a.logo_url);
  box.className=`appearance-mini-preview event-font-${a.font_style} event-card-${a.card_style}`;
  for(const [key,value] of Object.entries({'--mini-bg':a.background_color,'--mini-card':a.card_color,'--mini-text':a.text_color,'--mini-muted':a.muted_color,'--mini-button':a.button_color,'--mini-button-text':a.button_text_color,'--mini-radius':`${Number(a.card_radius)||22}px`,'--mini-card-opacity':String(Number(a.card_opacity)||.96)}))box.style.setProperty(key,value);
  box.innerHTML=`${media?`<div class="mini-media">${a.background_type==='video'?`<video src="${escape(media)}" muted autoplay loop playsinline></video>`:`<img src="${escape(media)}" alt="">`}</div>`:''}<div class="mini-overlay"></div><div class="mini-rsvp-card">${logo?`<img class="mini-logo" src="${escape(logo)}" alt="">`:''}<small>${escape(texts.eyebrow||'Confirmação de presença')}</small><h3>${escape(e.title||'Seu evento')}</h3><p>${escape(e.welcome_message||texts.intro||'Confirme sua presença.')}</p><span class="mini-button">${escape(texts.yes_button||'Confirmar presença')}</span></div>`;
 };
 const mark=()=>{render();if(state){state.textContent='Alterações não salvas';state.classList.add('dirty');}window.onbeforeunload=ev=>{ev.preventDefault();ev.returnValue='';};};
 formEl.addEventListener('input',mark);formEl.addEventListener('change',mark);render();
 if(state){state.textContent='✓ Tudo salvo';state.classList.remove('dirty');}
}
function guestInternalEditor(e,g,endpoint,done,mode='internal'){
 const members=g?.members||[];
 const fields=field('name','Nome do responsável','text',g?.name||'')+field('group_label','Nome da família/grupo · opcional','text',g?.group_label||'',false)+field('phone','WhatsApp · opcional','tel',g?.phone||'',false)+field('max_people','Limite total','number',g?.max_people||e.max_people)+field('max_adults_allowed','Máximo de adultos · opcional','number',g?.max_adults_allowed??'',false)+field('max_children_allowed','Máximo de crianças · opcional','number',g?.max_children_allowed??'',false)+select('response_status','Status geral',[['yes','Confirmado'],['no','Não vai'],['pending','Pendente']],g?.response_status||'pending')+`<label><span class="field-label">Pessoas da família</span><textarea name="members" placeholder="Maria; adulto; sim&#10;Pedro; criança; sim">${escape(members.map(m=>`${m.name}; ${m.person_type==='child'?'criança':'adulto'}; ${m.attendance_status==='no'?'não':m.attendance_status==='pending'?'pendente':'sim'}`).join('\n'))}</textarea><small class="field-hint">Uma por linha: nome; adulto/criança; sim/não/pendente.</small></label>`+`<label><span class="field-label">Restrições alimentares</span><textarea name="dietary">${escape(g?.dietary||'')}</textarea></label>`+`<label><span class="field-label">Observações</span><textarea name="notes">${escape(g?.notes||'')}</textarea></label>`+`<label><span class="field-label">Mensagem</span><textarea name="message">${escape(g?.message||'')}</textarea></label>`;
 const modal=openModal(g?'Editar família':'Adicionar família',form('family-editor',fields,g?'Salvar alterações':'Adicionar família'));
 submit('family-editor',async b=>{b.max_adults_allowed=b.max_adults_allowed===''?null:Number(b.max_adults_allowed);b.max_children_allowed=b.max_children_allowed===''?null:Number(b.max_children_allowed);const parsed=parseMemberLines(b.members);b.members=parsed.map(m=>{const prior=members.find(x=>normalizedName(x.name)===normalizedName(m.name));return {...m,...(prior?{id:prior.id,is_preapproved:prior.is_preapproved}:{})};});if(!b.members.length)b.members=[{name:b.name,person_type:'adult',attendance_status:b.response_status}];if(g)await api(endpoint,'PATCH',b);else await api(endpoint,'POST',b);modal.closeModal();await done();});
}
function eventSettingsFields(e={}){
 const basics=field('title','Nome do evento','text',e.title||'')+field('event_date','Data e hora · opcional','datetime-local',toLocalInput(e.event_date),false)+field('location','Local · opcional','text',e.location||'',false)+field('deadline','Prazo para confirmar · opcional','datetime-local',toLocalInput(e.deadline),false);
 const options=select('rsvp_mode','Como os convidados confirmam',[['free','Link livre'],['list','Lista com link privado por família']],e.rsvp_mode||'free')+select('list_behavior','Comportamento da lista',[['strict','Fechada: só pessoas cadastradas'],['flexible','Flexível: permite acompanhantes dentro do limite']],e.list_behavior||'strict')+field('max_people','Limite máximo por convite','number',e.max_people||10)+select('checkin_mode','Check-in por QR',[['off','Desativado'],['family','Um QR por família'],['individual','Um QR por pessoa']],e.checkin_mode||'off');
 if(e.id)return basics+options+select('status','Situação',[['active','Ativo'],['inactive','Pausado'],['archived','Arquivado']],e.status);
 return basics+`<label><span class="field-label">Endereço do evento<b class="required-mark">*</b></span><input name="slug" required autocapitalize="none" spellcheck="false"><small class="field-hint">Link público: …/<strong id="event-url-preview">seu-evento</strong></small></label><details class="advanced-options"><summary>Opções do RSVP e check-in</summary><div class="advanced-body">${options}</div></details>`;
}
async function dashboard(){
 if(!user.studio){goto('/admin');return;}
 const archived=new URL(location.href).searchParams.get('arquivados')==='1';
 const dashboardData=await api(`/api/events${archived?'?archived=1':''}`),events=dashboardData.events,entitlement=dashboardData.entitlement,s=user.studio;
 const active=events.filter(e=>e.status==='active').length;
 const billing=s.billing_mode==='credits'?{title:`${s.credits} crédito${s.credits===1?'':'s'}`,text:'disponíveis para novos eventos'}:{title:'Plano mensal',text:s.monthly_until?`vigente até ${formatDate(s.monthly_until)}`:'aguardando confirmação do pagamento'};
 const cards=events.map(e=>`<article class="event-card"><div class="event-card-top"><span class="status-chip ${statusTone(e.status)}">${escape(labelStatus(e.status))}</span><span class="event-date">${e.event_date?escape(formatDate(e.event_date)):'Data não informada'}</span></div><h2>${escape(e.title)}</h2><p>${e.location?escape(e.location):'Local ainda não informado'}</p><div class="mini-stats"><span><b>${Number(e.guest_count||0)}</b> convites</span><span><b>${Number(e.yes_count||0)}</b> confirmados</span><span><b>${Number(e.pending_count||0)}</b> pendentes</span></div><div class="event-card-actions">${archived?`<button class="button small" data-restore-event="${e.id}">Restaurar</button>`:`<a class="button small" href="/app/eventos/${e.id}">Gerenciar</a><a class="text-action" href="/${s.slug}/${e.slug}" target="_blank" rel="noopener">Abrir RSVP</a>`}</div></article>`).join('');
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">${escape(s.name)}</span><h1>${archived?'Eventos arquivados':'Seus eventos'}</h1><p>${archived?'Eventos guardados, sem receber novas confirmações.':'Uma visão rápida do que está ativo e do que vem a seguir.'}</p></div><div class="head-actions"><a class="button secondary" href="/app${archived?'':'?arquivados=1'}">${archived?'Ver ativos':'Arquivados'}</a>${archived?'':entitlement.can_create?`<button class="secondary" id="import-json">Importar JSON</button><a class="button primary" href="/app/eventos/novo">Novo evento</a>`:`<a class="button primary" href="/app/financeiro">Liberar criação de eventos</a>`}</div></section>${!archived&&!entitlement.can_create?`<div class="entitlement-alert"><strong>Criação bloqueada</strong><span>${escape(entitlement.reason)}</span><a href="/app/financeiro">Ver planos e pagamentos</a></div>`:''}<section class="summary-grid"><article><span>${archived?'Arquivados':'Eventos'}</span><strong>${events.length}</strong><small>${archived?'guardados':'nesta visão'}</small></article><article><span>Ativos</span><strong>${active}</strong><small>recebendo respostas</small></article><article><span>Seu plano</span><strong class="summary-text">${escape(billing.title)}</strong><small>${escape(billing.text)}</small></article></section><section class="content-section">${cards?`<div class="event-grid">${cards}</div>`:`<div class="empty-state"><div class="empty-mark">✓</div><h2>${archived?'Nenhum evento arquivado':'Seu primeiro evento começa aqui'}</h2><p>${archived?'Quando arquivar um evento, ele aparecerá aqui.':'Crie a celebração, personalize o RSVP e compartilhe o link.'}</p>${archived?'':entitlement.can_create?'<a class="button" href="/app/eventos/novo">Criar primeiro evento</a>':'<a class="button" href="/app/financeiro">Comprar crédito ou mensalidade</a>'}</div>`}</section>`;
 menuEvents();if(entitlement.can_create)click('import-json',()=>openJsonImport());document.querySelectorAll('[data-restore-event]').forEach(btn=>btn.onclick=async()=>{await api(`/api/events/${btn.dataset.restoreEvent}/restore`,'POST',{});await dashboard();});
}
async function newEvent(){
 const {entitlement}=await api('/api/events/entitlement');
 if(!entitlement.can_create){
  app.innerHTML=menu()+`<section class="flow-intro compact"><span class="eyebrow">Novo evento</span><h1>Libere a criação de eventos</h1><p>${escape(entitlement.reason)}</p></section><div class="card entitlement-paywall"><div class="paywall-mark">1</div><h2>Cada novo evento precisa estar coberto pelo seu plano</h2><p>Com créditos, 1 evento consome 1 crédito. Na mensalidade, você cria eventos enquanto ela estiver vigente.</p><a class="button primary full-button" href="/app/financeiro">Ir para planos e pagamentos</a><a class="button ghost full-button" href="/app">Voltar aos eventos</a></div>`;
  menuEvents();return;
 }
 app.innerHTML=menu()+`<section class="flow-intro compact"><span class="eyebrow">Novo evento</span><h1>Crie a base da celebração</h1><p>${entitlement.mode==='credits'?`Este evento usará 1 dos seus ${entitlement.credits} crédito(s).`:'Sua mensalidade está vigente e cobre este novo evento.'}</p></section><div class="card setup-card">${form('event',eventSettingsFields(),'Criar evento')}</div>`;
 menuEvents();bindAutoSlug('title','slug','event-url-preview');submit('event',async b=>{b.event_date=localToIso(b.event_date);b.deadline=localToIso(b.deadline);const {event}=await api('/api/events','POST',b);goto(`/app/eventos/${event.id}`);});
}
function guestRowHtml(e,g,link){
 const people=g.members.filter(m=>m.attendance_status==='yes'),adults=people.filter(m=>m.person_type==='adult').length,children=people.filter(m=>m.person_type==='child').length;
 return `<article class="guest-row guest-card" data-guest="${g.id}" data-name="${escape(normalizedName(g.name+' '+g.group_label+' '+g.members.map(m=>m.name).join(' ')))}" data-status="${g.response_status}" data-duplicate="${g.possible_duplicate?'1':'0'}"><label class="guest-select"><input type="checkbox" data-select-guest="${g.id}"></label><div class="guest-main"><div><strong>${escape(g.group_label||g.name)}</strong><span class="status-chip ${statusTone(g.response_status)}">${escape(labelStatus(g.response_status))}</span>${g.possible_duplicate?`<span class="duplicate-chip ${g.suggested_keep?'keep':'copy'}">${g.suggested_keep?'Provável original':'Possível cópia'}</span>`:''}</div>${g.group_label?`<p>Responsável: ${escape(g.name)}</p>`:''}<p>${g.members.map(m=>`${escape(m.name)}${m.person_type==='child'?' · criança':''}`).join(' · ')}</p><small>${adults} adulto${adults===1?'':'s'} · ${children} criança${children===1?'':'s'}${g.responded_at?` · respondeu ${escape(formatDate(g.responded_at,true))}`:''} · ${escape(guestSourceLabel(g.source))}</small>${g.message?`<small class="guest-message">“${escape(g.message)}”</small>`:''}</div><div class="guest-actions"><a class="text-action" href="${link}?invite=${encodeURIComponent(g.token)}" target="_blank" rel="noopener">Abrir convite</a><button class="secondary small" data-edit="${g.id}">Editar</button><button class="quiet-danger small" data-delete="${g.id}">Lixeira</button></div></article>`;
}
async function showHistory(base){
 const {audit}=await api(`${base}/audit`),labels={create_event:'Evento criado',update_event:'Evento atualizado',duplicate_event:'Evento duplicado',guest_created:'Convidado cadastrado',guest_updated:'Convidado editado',guest_deleted:'Convidado enviado à lixeira',guest_restored:'Convidado restaurado',guest_bulk_deleted:'Convidados enviados à lixeira',guest_bulk_restored:'Convidados restaurados',rsvp_submitted:'Confirmação enviada',media_uploaded:'Mídia enviada',media_deleted:'Mídia removida',checkin:'Check-in',client_link_reset:'Link do cliente renovado',client_event_updated:'Cliente editou o evento'};
 openModal('Histórico do evento',audit.length?`<div class="history-list">${audit.map(x=>`<div class="history-item"><div><strong>${escape(labels[x.action]||x.action)}</strong><span>${escape(x.actor_name||'Sistema / convidado')}</span></div><time>${escape(formatDate(x.created_at,true))}</time></div>`).join('')}</div>`:'<div class="empty-state compact"><p>Nenhuma alteração registrada ainda.</p></div>');
}
function uploadBinary(url,file,headers={},onProgress=()=>{}){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST',url);
  for(const [key,value] of Object.entries(headers))xhr.setRequestHeader(key,value);
  xhr.upload.onprogress=ev=>{if(ev.lengthComputable)onProgress(Math.round(ev.loaded/ev.total*100));};
  xhr.onerror=()=>reject(Error('Não foi possível enviar o arquivo.'));
  xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText||'{}');}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(Error(data.error||'Não foi possível enviar o arquivo.'));};
  xhr.send(file);
 });
}
function openBulkAdd(e,endpoint,done){
 const modal=openModal('Adicionar vários convidados',form('bulk-add','<label><span class="field-label">Um nome por linha<b class="required-mark">*</b></span><textarea name="names" rows="12" required placeholder="Maria Silva\\nJoão Souza\\nFamília Costa"></textarea><small class="field-hint">Cada nome entra como uma família de 1 adulto pendente. Você pode editar e agrupar depois.</small></label>','Cadastrar lista'));
 submit('bulk-add',async b=>{
  const names=String(b.names||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!names.length)throw Error('Informe pelo menos um nome.');
  if(names.length>300)throw Error('Adicione até 300 nomes por vez.');
  await api(endpoint,'POST',{guests:names.map(name=>({name,max_people:e.max_people}))});
  modal.closeModal();await done();
 });
}
function showMessages(guests){
 const messages=guests.filter(g=>g.message).map(g=>({name:g.group_label||g.name,message:g.message,date:g.responded_at}));
 const modal=openModal('Mensagens dos convidados',`<input id="message-search" placeholder="Buscar mensagem ou nome">${messages.length?`<div class="message-grid" id="message-grid">${messages.map(m=>`<article class="message-card" data-message="${escape(normalizedName(m.name+' '+m.message))}"><blockquote>“${escape(m.message)}”</blockquote><footer><strong>${escape(m.name)}</strong>${m.date?` · ${escape(formatDate(m.date,true))}`:''}</footer></article>`).join('')}</div>`:'<div class="empty-state compact"><p>Ainda não há mensagens.</p></div>'}`);
 const search=modal.querySelector('#message-search');
 if(search)search.oninput=()=>{const q=normalizedName(search.value);modal.querySelectorAll('[data-message]').forEach(x=>x.hidden=!!q&&!x.dataset.message.includes(q));};
}
function exportEventPdf(e,guests,studioName){
 const win=window.open('','_blank');
 if(!win){notice('O navegador bloqueou a janela do PDF. Libere pop-ups para este site.');return;}
 const yes=guests.flatMap(g=>g.members).filter(m=>m.attendance_status==='yes'),adults=yes.filter(m=>m.person_type==='adult').length,children=yes.filter(m=>m.person_type==='child').length,messages=guests.filter(g=>g.message);
 const families=guests.map(g=>`<section class="family"><div class="family-head"><div><h3>${escape(g.group_label||g.name)}</h3>${g.group_label?`<small>Responsável: ${escape(g.name)}</small>`:''}</div><b>${escape(labelStatus(g.response_status))}</b></div>${g.members.map(m=>`<div class="person"><span>${m.attendance_status==='yes'?'✓':m.attendance_status==='no'?'×':'•'} ${escape(m.name)} <small>· ${m.person_type==='child'?'criança':'adulto'}</small></span><b>${escape(labelStatus(m.attendance_status))}</b></div>`).join('')}${g.dietary?`<p><strong>Restrição:</strong> ${escape(g.dietary)}</p>`:''}${g.notes?`<p><strong>Observação:</strong> ${escape(g.notes)}</p>`:''}</section>`).join('');
 const notes=messages.map(g=>`<article class="message"><blockquote>“${escape(g.message)}”</blockquote><small>${escape(g.group_label||g.name)}</small></article>`).join('');
 win.document.open();
 win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(e.title)} · Lista</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#352d30;margin:0}.head{padding:20px;border:1px solid #e6d8da;border-radius:18px}.brand{font-size:11px;color:#8d6267;text-transform:uppercase;letter-spacing:1px}.head h1{margin:7px 0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.stat,.family,.message{border:1px solid #eadfe1;border-radius:12px;padding:11px}.stat{text-align:center}.stat b{display:block;font-size:20px;color:#7a4f55}.stat span,small{color:#7d7378;font-size:9px}.family{break-inside:avoid;margin:8px 0}.family-head,.person{display:flex;justify-content:space-between;gap:10px}.family h3{margin:0 0 7px}.person{padding:6px 0;border-top:1px solid #f0e8ea;font-size:10px}.family p{font-size:9px}.message{break-inside:avoid;margin:8px 0}.message blockquote{margin:0 0 7px;font-size:11px}.print{position:fixed;right:15px;bottom:15px;border:0;border-radius:10px;padding:11px 15px;background:#7a4f55;color:#fff}@media print{.print{display:none}}</style></head><body><header class="head"><div class="brand">${escape(studioName||'Presença Confirmada')}</div><h1>${escape(e.title)}</h1><small>${escape(formatDate(e.event_date,true)||'Data não informada')}</small></header><div class="stats"><div class="stat"><b>${yes.length}</b><span>confirmados</span></div><div class="stat"><b>${adults}</b><span>adultos</span></div><div class="stat"><b>${children}</b><span>crianças</span></div><div class="stat"><b>${guests.filter(g=>g.response_status==='pending').length}</b><span>pendentes</span></div></div><h2>Lista de presença</h2>${families||'<p>Nenhum convidado.</p>'}${messages.length?`<h2>Mensagens</h2>${notes}`:''}<button class="print" onclick="window.print()">Salvar / imprimir PDF</button></body></html>`);
 win.document.close();
}
async function eventPage(eventId){
 const base=\`/api/events/\${eventId}\`;
 const results=await Promise.all([api(base),api(\`\${base}/guests\`),api(\`\${base}/guests?trash=1\`),api(\`\${base}/media\`),api('/api/events/entitlement')]),e=results[0].event,guests=markDuplicates(results[1].guests),trash=results[2].guests,media=results[3].media,entitlement=results[4].entitlement;
 const confirmed=guests.filter(g=>g.response_status==='yes'),pending=guests.filter(g=>g.response_status==='pending'),link=\`/\${user.studio.slug}/\${e.slug}\`,a=eventAppearance(e),extra=eventExtra(e),texts={...PUBLIC_TEXTS[a.interface_language==='en'?'en':'pt-BR'],...parseObj(e.public_texts)},permissions={...DEFAULT_CLIENT_PERMISSIONS,...parseObj(e.client_permissions)},confirmedPeople=confirmed.reduce((n,g)=>n+g.members.filter(m=>m.attendance_status==='yes').length,0);
 const requested=new URL(location.href).searchParams.get('tab'),tab=['overview','guests','appearance','settings'].includes(requested)?requested:'overview';
 const publicUrl=location.origin+link,clientUrl=\`\${location.origin}/cliente/\${encodeURIComponent(e.client_token)}\`;
 const tabLink=(key,label)=>\`<a class="\${tab===key?'active':''}" href="/app/eventos/\${eventId}?tab=\${key}">\${label}</a>\`;
 const mediaCards=media.map(m=>\`<div class="media-card"><div class="media-thumb">\${m.mime_type.startsWith('video/')?\`<video src="\${mediaUrl(m.id)}" muted playsinline></video>\`:\`<img src="\${mediaUrl(m.id)}" alt="">\`}</div><div><strong>\${escape(({background_image:'Fundo',background_video:'Vídeo',cover:'Capa',logo:'Logo',other:'Mídia'}[m.media_kind]||'Mídia'))}</strong><small>\${escape(m.original_name||m.mime_type)}</small></div><div class="media-actions"><button class="secondary small" data-use-media="\${m.id}" data-kind="\${m.media_kind}">Usar</button><button class="quiet-danger small" data-delete-media="\${m.id}">Remover</button></div></div>\`).join('');
 const header=\`<section class="app-page-head event-head"><div><span class="eyebrow">\${escape(user.studio.name)}</span><div class="title-with-status"><h1>\${escape(e.title)}</h1><span class="status-chip \${statusTone(e.status)}">\${escape(labelStatus(e.status))}</span></div><p>\${e.event_date?escape(formatDate(e.event_date,true)):'Data ainda não informada'}\${e.location?\` · \${escape(e.location)}\`:''}</p></div><div class="head-actions"><a class="button" href="\${link}" target="_blank" rel="noopener">Abrir RSVP</a><button class="secondary" id="copy-public">Copiar RSVP</button>\${e.checkin_mode!=='off'?\`<a class="button secondary" href="/app/eventos/\${eventId}/checkin">Check-in</a>\`:''}</div></section>
 <nav class="event-tabs" aria-label="Áreas do evento">\${tabLink('overview','Visão geral')}\${tabLink('guests','Convidados')}\${tabLink('appearance','Personalização')}\${tabLink('settings','Configurações')}</nav>\`;
 let content='';
 if(tab==='overview'){
  content=\`<section class="summary-grid event-summary"><article><span>Confirmados</span><strong>\${confirmedPeople}</strong><small>pessoas</small></article><article><span>Adultos</span><strong>\${confirmed.reduce((n,g)=>n+g.members.filter(m=>m.attendance_status==='yes'&&m.person_type==='adult').length,0)}</strong><small>confirmados</small></article><article><span>Crianças</span><strong>\${confirmed.reduce((n,g)=>n+g.members.filter(m=>m.attendance_status==='yes'&&m.person_type==='child').length,0)}</strong><small>confirmadas</small></article><article><span>Pendentes</span><strong>\${pending.length}</strong><small>respostas</small></article><article><span>Respondidos</span><strong>\${guests.length?Math.round((guests.length-pending.length)/guests.length*100):0}%</strong><small>da lista</small></article></section>
  <section class="event-link-grid">
   <article class="event-link-card"><div><span class="eyebrow">Convidados</span><h2>Link do RSVP</h2><p>Este é o link que vai no convite ou é enviado aos convidados.</p></div><div class="link-code">\${escape(publicUrl)}</div><div class="event-link-actions"><a class="button" href="\${link}" target="_blank" rel="noopener">Abrir RSVP</a><button class="secondary" id="copy-public-overview">Copiar link</button></div></article>
   <article class="event-link-card client-link-card"><div><span class="eyebrow">Sua cliente</span><h2>Painel privado da cliente</h2><p>Envie este link para a responsável pela festa acompanhar o evento. Ele é privado e não deve ir no convite.</p></div><div class="link-code" id="client-link-code">\${escape(clientUrl)}</div><div class="event-link-actions"><a class="button" href="/cliente/\${encodeURIComponent(e.client_token)}" target="_blank" rel="noopener">Abrir painel</a><button class="secondary" id="copy-client">Copiar link da cliente</button><button class="quiet-danger" id="reset-client-link-overview">Trocar link</button></div></article>
  </section>
  <section class="overview-info-grid"><article class="card section-card"><span class="eyebrow">Como funciona</span><h2>\${e.rsvp_mode==='list'?'Lista por família':'Confirmação livre'}</h2><p>\${e.rsvp_mode==='list'?(e.list_behavior==='flexible'?'A família recebe link individual e pode incluir acompanhantes dentro dos limites definidos.':'Somente as pessoas pré-cadastradas naquela família podem responder.'):\`Qualquer convidado com o link pode responder. O limite atual é de até \${e.max_people} pessoa(s) por confirmação.\`}</p><a class="text-action" href="/app/eventos/\${eventId}?tab=settings">Alterar regras</a></article><article class="card section-card"><span class="eyebrow">Acesso da cliente</span><h2>O que ela pode fazer?</h2><p>\${Object.entries(permissions).filter(([k,v])=>k!=='view'&&v).length?Object.entries({manage_guests:'Gerenciar convidados',manage_appearance:'Alterar aparência',manage_texts:'Alterar textos',view_messages:'Ver mensagens',export_guests:'Exportar lista',manage_event_details:'Editar dados'}).filter(([k])=>permissions[k]).map(([,v])=>v).join(' · '):'Somente acompanhar o resumo e a lista permitida.'}</p><a class="text-action" href="/app/eventos/\${eventId}?tab=settings">Editar permissões</a></article></section>\`;
 }
 if(tab==='guests'){
  content=\`<div class="card section-card"><div class="section-row"><div><h2>Convidados e famílias</h2><p>Busque, filtre, selecione e organize a lista.</p></div><div class="row"><button class="secondary small" id="add-family">Adicionar família</button><button class="secondary small" id="bulk-add-guests">Adicionar vários</button><button class="secondary small" id="messages">Mensagens</button><button class="secondary small" id="export">CSV</button><button class="secondary small" id="export-pdf">PDF</button></div></div>
  <div class="guest-toolbar"><input id="search" placeholder="Buscar convidado ou acompanhante"><div class="filter-chips"><button class="active" data-filter="">Todos <b>\${guests.length}</b></button><button data-filter="yes">Confirmados <b>\${confirmed.length}</b></button><button data-filter="pending">Pendentes <b>\${pending.length}</b></button><button data-filter="no">Não irão <b>\${guests.filter(g=>g.response_status==='no').length}</b></button><button data-filter="duplicates">Duplicados <b>\${guests.filter(g=>g.possible_duplicate).length}</b></button></div></div>
  <div class="bulk-tools"><button class="secondary small" id="select-visible">Selecionar exibidos</button></div><div class="bulk-bar" id="bulk-bar" hidden><strong id="bulk-count">0 selecionados</strong><button class="quiet-danger small" id="bulk-delete">Enviar à lixeira</button><button class="secondary small" id="bulk-clear">Cancelar seleção</button></div>
  <div id="guests">\${guests.map(g=>guestRowHtml(e,g,link)).join('')||'<div class="empty-state compact"><h3>Nenhum convidado cadastrado</h3><p>Adicione uma família ou importe sua lista.</p></div>'}</div>
  <div class="inline-tools"><details><summary>Importar lista em CSV</summary>\${form('import','<label><span class="field-label">Lista CSV<b class="required-mark">*</b></span><textarea name="csv" required placeholder="nome,telefone,max_pessoas,max_adultos,max_criancas,grupo\\nMaria,62999999999,4,2,2,Família Silva"></textarea><small class="field-hint">Também aceitamos o formato antigo nome,telefone,max_pessoas.</small></label>','Importar lista')}</details><details><summary>Lixeira (\${trash.length})</summary><div class="trash-list">\${trash.length?trash.map(g=>\`<div class="trash-row"><span>\${escape(g.group_label||g.name)}</span><button class="secondary small" data-restore-guest="\${g.id}">Restaurar</button></div>\`).join(''):'<p class="muted">A lixeira está vazia.</p>'}</div></details></div></div>\`;
 }
 if(tab==='appearance'){
  content=\`<section class="appearance-workspace"><div class="appearance-controls-stack">
   <div class="card section-card"><div class="section-row"><div><span class="eyebrow">Mídias</span><h2>Fundo e identidade</h2><p>Envie o fundo, vídeo, capa ou logo usados no RSVP.</p></div></div><div class="media-uploader"><label><span class="field-label">Tipo da mídia</span><select id="media-kind"><option value="background_image">Imagem de fundo</option><option value="background_video">Vídeo de fundo</option><option value="cover">Capa / detalhe superior</option><option value="logo">Logo / monograma</option><option value="other">Outra mídia</option></select></label><label class="upload-box"><span>Enviar arquivo</span><input id="upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"><small>Imagens até 10 MB; vídeos até 20 MB.</small></label><p id="media-result" class="field-hint"></p></div><div class="media-library">\${mediaCards||'<p class="muted">Nenhuma mídia enviada.</p>'}</div></div>
   <div class="card section-card"><div class="section-row"><div><span class="eyebrow">Visual</span><h2>Aparência do RSVP</h2><p>Organizada por fundo, card, tipografia e agenda.</p></div></div>\${form('appearance',appearanceFields(a),'Salvar aparência')}<p class="save-state" id="appearance-save-state">✓ Tudo salvo</p></div>
   <div class="card section-card"><div class="section-row"><div><span class="eyebrow">Conteúdo</span><h2>Textos do convidado</h2><p>Personalize as mensagens sem misturar com as configurações visuais.</p></div></div>\${form('public-texts',Object.entries({eyebrow:'Título pequeno',intro:'Introdução',name_label:'Pergunta do nome',yes_button:'Botão positivo',no_button:'Botão negativo',decline_hint:'Mensagem após escolher “não”',success_title:'Título após confirmar',success_message:'Mensagem após confirmar',decline_title:'Título após recusar',decline_message:'Mensagem após recusar',message_label:'Título da mensagem',message_placeholder:'Texto dentro da mensagem',calendar_button:'Botão da agenda',back_button:'Botão voltar ao convite',closed_title:'Título quando encerrar'}).map(([k,l])=>field(k,l,'text',texts[k]||'',false)).join(''),'Salvar textos')}</div>
  </div><aside class="appearance-sticky-preview"><span class="eyebrow">Prévia ao vivo</span><h3>Como o convidado verá</h3><div id="appearance-preview"></div><a class="button secondary full-button" href="\${link}" target="_blank" rel="noopener">Abrir RSVP real</a></aside></section>\`;
 }
 if(tab==='settings'){
  content=\`<section class="settings-workspace"><div class="card section-card"><span class="eyebrow">Evento</span><h2>Dados e regras do RSVP</h2><p class="muted">Defina tipo de confirmação, limites, prazo e check-in.</p>\${form('settings',eventSettingsFields(e),'Salvar alterações')}</div>
  <div class="card section-card"><span class="eyebrow">Formulário</span><h2>Campos opcionais</h2><p class="muted">Escolha o que será perguntado além da presença e acompanhantes.</p>\${form('extra-fields',\`<div class="permission-list">\${[['phone','Telefone'],['dietary','Restrição alimentar'],['notes','Observações'],['message','Mensagem carinhosa']].map(([k,l])=>\`<label class="check-label"><input type="checkbox" name="\${k}" \${extra[k]?'checked':''}> <span>\${l}</span></label>\`).join('')}</div>\`,'Salvar campos')}</div>
  <div class="card section-card client-access-settings"><span class="eyebrow">Sua cliente</span><h2>Permissões do painel privado</h2><p class="muted">O link da cliente fica na aba <strong>Visão geral</strong>. Aqui você escolhe o que ela pode editar.</p>\${form('client-permissions',\`<div class="permission-list">\${[['manage_guests','Adicionar e editar convidados'],['manage_appearance','Alterar aparência e mídias'],['manage_texts','Alterar textos públicos'],['view_messages','Ver mensagens dos convidados'],['export_guests','Exportar lista e PDF'],['manage_event_details','Alterar data, local e campos']].map(([k,l])=>\`<label class="check-label"><input type="checkbox" name="\${k}" \${permissions[k]?'checked':''}> <span>\${l}</span></label>\`).join('')}</div>\`,'Salvar permissões')}<a class="text-action" href="/app/eventos/\${eventId}?tab=overview">Ver link da cliente</a></div>
  <div class="card section-card"><span class="eyebrow">Ferramentas</span><h2>Gerenciamento do evento</h2><div class="tool-stack">\${entitlement.can_create?'<button class="secondary" id="duplicate-event">Duplicar evento</button>':'<a class="button secondary" href="/app/financeiro">Comprar plano para duplicar</a>'}<button class="secondary" id="history">Histórico</button><button class="secondary" id="import-event-json">Importar JSON</button><button class="secondary" id="export-event-json">Exportar JSON</button><button class="secondary" id="pause-event">\${e.status==='active'?'Pausar confirmações':'Reativar confirmações'}</button><button class="quiet-danger" id="archive-event">Arquivar evento</button></div></div></section>\`;
 }
 app.innerHTML=menu()+header+content;
 menuEvents();
 click('copy-public',async()=>{await navigator.clipboard.writeText(publicUrl);notice('Link do RSVP copiado.');});
 if(tab==='overview'){
  click('copy-public-overview',async()=>{await navigator.clipboard.writeText(publicUrl);notice('Link do RSVP copiado.');});
  click('copy-client',async()=>{await navigator.clipboard.writeText(clientUrl);notice('Link da cliente copiado.');});
  click('reset-client-link-overview',async()=>{if(!confirm('O link privado atual deixará de funcionar. Criar outro?'))return;const result=await api(\`\${base}/client-link\`,'POST',permissions);const next=new URL(result.url,location.origin).href;await navigator.clipboard.writeText(next);notice('Novo link da cliente criado e copiado.');await eventPage(eventId);});
 }
 if(tab==='guests'){
  click('add-family',()=>guestInternalEditor(e,null,\`\${base}/guests\`,()=>eventPage(eventId)));
  click('bulk-add-guests',()=>openBulkAdd(e,\`\${base}/guests\`,()=>eventPage(eventId)));
  click('messages',()=>showMessages(guests));
  submit('import',async b=>{const rows=parseCSV(b.csv),headers=rows.shift()?.map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase()),head=headers?.join(','),extended=head==='nome,telefone,max_pessoas,max_adultos,max_criancas,grupo',legacy=head==='nome,telefone,max_pessoas'||head==='name,phone,max_people';if(!extended&&!legacy)throw Error('Use o cabeçalho indicado no exemplo.');await api(\`\${base}/guests\`,'POST',{guests:rows.filter(r=>r.some(Boolean)).map(r=>({name:r[0],phone:r[1],max_people:r[2]||e.max_people,...(extended?{max_adults_allowed:r[3]||null,max_children_allowed:r[4]||null,group_label:r[5]||''}:{})}))});await eventPage(eventId);});
  document.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>guestInternalEditor(e,guests.find(g=>g.id===btn.dataset.edit),\`\${base}/guests/\${btn.dataset.edit}\`,()=>eventPage(eventId)));
  document.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm('Enviar esta família para a lixeira?'))return;await api(\`\${base}/guests/\${btn.dataset.delete}\`,'DELETE');await eventPage(eventId);});
  document.querySelectorAll('[data-restore-guest]').forEach(btn=>btn.onclick=async()=>{await api(\`\${base}/guests/\${btn.dataset.restoreGuest}/restore\`,'POST',{});await eventPage(eventId);});
  click('export',()=>downloadCSV(guests));click('export-pdf',()=>exportEventPdf(e,guests,user.studio.name));
  const selected=new Set(),bulk=document.querySelector('#bulk-bar'),count=document.querySelector('#bulk-count');const syncSelection=()=>{count.textContent=\`\${selected.size} selecionado\${selected.size===1?'':'s'}\`;bulk.hidden=!selected.size;};document.querySelectorAll('[data-select-guest]').forEach(cb=>cb.onchange=()=>{cb.checked?selected.add(cb.dataset.selectGuest):selected.delete(cb.dataset.selectGuest);syncSelection();});click('select-visible',()=>{document.querySelectorAll('[data-guest]:not([hidden]) [data-select-guest]').forEach(x=>{x.checked=true;selected.add(x.dataset.selectGuest);});syncSelection();});click('bulk-clear',()=>{selected.clear();document.querySelectorAll('[data-select-guest]').forEach(x=>x.checked=false;);syncSelection();});click('bulk-delete',async()=>{if(!confirm(\`Enviar \${selected.size} convidado(s) para a lixeira?\`))return;await api(\`\${base}/guests/bulk\`,'POST',{action:'delete',ids:[...selected]});await eventPage(eventId);});
  let activeFilter='';const filter=()=>{const q=normalizedName(document.querySelector('#search').value);document.querySelectorAll('[data-guest]').forEach(row=>{const matchesSearch=!q||row.dataset.name.includes(q),matchesFilter=!activeFilter||(activeFilter==='duplicates'?row.dataset.duplicate==='1':row.dataset.status===activeFilter);row.hidden=!(matchesSearch&&matchesFilter);});};document.querySelector('#search').oninput=filter;document.querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');activeFilter=btn.dataset.filter;filter();});
 }
 if(tab==='appearance'){
  bindAppearancePreview('appearance-preview',document.querySelector('#appearance'),e,a,texts,'appearance-save-state');
  submit('public-texts',async(_,formEl)=>{await api(base,'PATCH',{public_texts:Object.fromEntries(new FormData(formEl))});notice('Textos atualizados.');await eventPage(eventId);});
  submit('appearance',async(_,formEl)=>{await api(base,'PATCH',{appearance:collectAppearance(formEl,a)});window.onbeforeunload=null;notice('Aparência atualizada.');await eventPage(eventId);});
  document.querySelector('#upload').onchange=async ev=>{const file=ev.target.files[0];if(!file)return;const kind=document.querySelector('#media-kind').value,result=document.querySelector('#media-result');if(document.querySelector('#appearance-save-state')?.classList.contains('dirty')){ev.target.value='';notice('Salve a aparência antes de enviar uma nova mídia.');return;}result.textContent='Enviando 0%';try{const data=await uploadBinary(\`\${base}/media?kind=\${encodeURIComponent(kind)}\`,file,{'content-type':file.type,'x-file-name':encodeURIComponent(file.name)},n=>{result.textContent=n>=100?'Processando…':\`Enviando \${n}%\`;});const next={...a},url=data.media.url;if(kind==='background_image'||kind==='background_video'){next.background_type=kind==='background_video'?'video':'image';next.background_url=url;}else if(kind==='cover')next.cover_url=url;else if(kind==='logo')next.logo_url=url;await api(base,'PATCH',{appearance:next});result.textContent='Mídia enviada e aplicada.';await eventPage(eventId);}catch(err){result.textContent='';notice(err.message);}};
  document.querySelectorAll('[data-use-media]').forEach(btn=>btn.onclick=async()=>{if(document.querySelector('#appearance-save-state')?.classList.contains('dirty')){notice('Salve a aparência antes de trocar a mídia.');return;}const next={...a},url=mediaUrl(btn.dataset.useMedia),kind=btn.dataset.kind;if(kind==='background_image'||kind==='background_video'){next.background_type=kind==='background_video'?'video':'image';next.background_url=url;}else if(kind==='cover')next.cover_url=url;else if(kind==='logo')next.logo_url=url;await api(base,'PATCH',{appearance:next});notice('Mídia aplicada.');await eventPage(eventId);});
  document.querySelectorAll('[data-delete-media]').forEach(btn=>btn.onclick=async()=>{if(document.querySelector('#appearance-save-state')?.classList.contains('dirty')){notice('Salve a aparência antes de remover uma mídia.');return;}if(!confirm('Remover esta mídia?'))return;await api(\`\${base}/media/\${btn.dataset.deleteMedia}\`,'DELETE');await eventPage(eventId);});
 }
 if(tab==='settings'){
  submit('settings',async b=>{b.event_date=localToIso(b.event_date);b.deadline=localToIso(b.deadline);await api(base,'PATCH',b);notice('Evento atualizado.');await eventPage(eventId);});
  submit('extra-fields',async(_,formEl)=>{const fd=new FormData(formEl);await api(base,'PATCH',{extra_fields:Object.fromEntries(['phone','dietary','notes','message'].map(k=>[k,fd.has(k)]))});notice('Campos atualizados.');});
  submit('client-permissions',async(_,formEl)=>{const fd=new FormData(formEl),body={view:true};for(const k of Object.keys(DEFAULT_CLIENT_PERMISSIONS))if(k!=='view')body[k]=fd.has(k);await api(base,'PATCH',{client_permissions:body});notice('Permissões da cliente salvas.');});
  click('import-event-json',()=>openJsonImport(eventId,e,()=>eventPage(eventId)));click('export-event-json',()=>downloadJson(\`\${cleanSlug(e.title)||'evento'}-config.json\`,exportEventJson(e)));if(entitlement.can_create)click('duplicate-event',async()=>{if(!confirm('Duplicar este evento? A cópia conta como um novo evento e usa seu plano vigente.'))return;const {event}=await api(\`\${base}/duplicate\`,'POST',{});goto(\`/app/eventos/\${event.id}\`);});click('pause-event',async()=>{await api(base,'PATCH',{status:e.status==='active'?'inactive':'active'});await eventPage(eventId);});click('archive-event',async()=>{if(!confirm('Arquivar este evento? O RSVP deixará de receber respostas.'))return;await api(\`\${base}/archive\`,'POST',{});goto('/app');});click('history',()=>showHistory(base));
 }
}
function parseCSV(input){const rows=[[]];let current='',quoted=false;for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){rows.at(-1).push(current);current='';}else if(c==='\n'&&!quoted){rows.at(-1).push(current.replace(/\r$/,''));current='';rows.push([]);}else current+=c;}if(quoted)throw Error('CSV com aspas não fechadas.');rows.at(-1).push(current.replace(/\r$/,''));return rows;}
function downloadCSV(guests){
 const cell=v=>`"${String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')}"`;
 const data=[['grupo','responsavel','telefone','status','adultos','criancas','restricoes','mensagem'],...guests.map(g=>{const yes=g.members.filter(m=>m.attendance_status==='yes');return [g.group_label,g.name,g.phone,labelStatus(g.response_status),yes.filter(m=>m.person_type==='adult').length,yes.filter(m=>m.person_type==='child').length,g.dietary,g.message];})].map(r=>r.map(cell).join(',')).join('\r\n');
 const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff',data],{type:'text/csv;charset=utf-8'}));link.download='convidados.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
function publicFrame(e,content){
 const a=eventAppearance(e),t=eventTexts(e),logo=safeMedia(a.logo_url)?`<img class="event-logo" src="${escape(safeMedia(a.logo_url))}" alt="">`:'',cover=safeMedia(a.cover_url)?`<img class="event-cover" src="${escape(safeMedia(a.cover_url))}" alt="">`:'';
 return `<div class="rsvp-shell event-font-${escape(a.font_style)} event-width-${escape(a.card_width)}">${cover}<div class="rsvp-card">${logo}<div class="rsvp-brand">${escape(e.studio_name||'')}</div><span class="eyebrow">${escape(t.eyebrow)}</span><h1>${escape(e.title)}</h1>${content}</div></div>`;
}
function publicOptionalFields(e,g={}){
 const f=eventExtra(e),t=eventTexts(e);
 return `${f.phone?field('phone',ptr(e,'WhatsApp · opcional','Phone · optional'),'tel',g.phone||'',false):''}${f.dietary?`<label><span class="field-label">${ptr(e,'Restrição alimentar · opcional','Dietary restrictions · optional')}</span><textarea name="dietary">${escape(g.dietary||'')}</textarea></label>`:''}${f.notes?`<label><span class="field-label">${ptr(e,'Observações · opcional','Notes · optional')}</span><textarea name="notes">${escape(g.notes||'')}</textarea></label>`:''}${f.message?`<label><span class="field-label">${escape(t.message_label)}</span><textarea name="message" placeholder="${escape(t.message_placeholder)}">${escape(g.message||'')}</textarea></label>`:''}`;
}
function publicSuccess(e,guest){
 const t=eventTexts(e),a=eventAppearance(e),yes=guest.response_status==='yes',qrs=guest.qr_token?[{name:guest.name,token:guest.qr_token}]:guest.members.filter(m=>m.qr_token).map(m=>({name:m.name,token:m.qr_token}));
 app.innerHTML=publicFrame(e,`<div class="success-card"><div class="success-mark">${yes?'✓':'♡'}</div><h2>${escape(yes?t.success_title:t.decline_title)}</h2><p>${escape(yes?t.success_message:t.decline_message)}</p>${yes&&e.event_date?`<div class="success-event-summary"><strong>${escape(formatDate(e.event_date,true))}</strong>${(a.calendar_location||e.location)?`<span>${escape(a.calendar_location||e.location)}</span>`:''}</div><button class="full-button" id="calendar">${escape(t.calendar_button)}</button>`:''}${safeHref(a.invitation_url)?`<a class="button secondary full-button" href="${escape(safeHref(a.invitation_url))}">${escape(t.back_button)}</a>`:''}<a class="button ghost full-button" href="${location.pathname}?invite=${encodeURIComponent(guest.token)}">${ptr(e,'Alterar minha resposta','Change my response')}</a>${qrs.length?`<div class="qr-links"><h3>${ptr(e,'QR de entrada','Entry QR')}</h3>${qrs.map(q=>`<a href="/q/${q.token}">${escape(q.name)}</a>`).join('')}</div>`:''}</div>`);
 applyAppearance(e.appearance,e.brand);click('calendar',()=>openCalendarMenu(e));
}
function freeRsvp(e,endpoint,guest=null){
 const t=eventTexts(e),requestId=crypto.randomUUID(),limit=Number(e.max_people||1),existing=(guest?.members||[]).filter(m=>m.attendance_status!=='no'),initialStatus=guest?.response_status&&guest.response_status!=='pending'?guest.response_status:'';
 const primaryName=guest?.name||'',companions=existing.filter((m,i)=>!(i===0&&normalizedName(m.name)===normalizedName(primaryName)));
 const companionGate=limit<=1
  ?\`<div class="rsvp-individual-note"><strong>\${ptr(e,'Confirmação individual','Individual RSVP')}</strong><span>\${ptr(e,'Este convite permite confirmar apenas uma pessoa.','This invitation allows only one attendee.')}</span></div>\`
  :\`<div class="rsvp-companion-gate" id="companion-gate" hidden>
    <span class="field-label">\${ptr(e,'Você vai levar acompanhante?','Will you bring anyone with you?')}</span>
    <div class="rsvp-choice-grid" id="companion-choice">
      <button type="button" data-companion="no">\${ptr(e,'Não, só eu','No, just me')}</button>
      <button type="button" data-companion="yes">\${ptr(e,'Sim, vou levar','Yes, I will')}</button>
    </div>
    <input type="hidden" name="has_companion" value="">
    <div id="companion-section" class="companion-section" hidden>
      <div class="companion-section-head"><div><strong>\${ptr(e,'Quem vai com você?','Who is coming with you?')}</strong><span>\${ptr(e,'Adicione uma pessoa por campo.','Add one person per field.')}</span></div><b id="companion-count">0/\${Math.max(0,limit-1)}</b></div>
      <div id="free-members" class="free-members"></div>
      <div class="companion-actions">
        <button type="button" class="secondary small" id="add-adult">\${ptr(e,'+ Adulto','+ Adult')}</button>
        <button type="button" class="secondary small" id="add-child">\${ptr(e,'+ Criança','+ Child')}</button>
      </div>
    </div>
   </div>\`;
 const fields=field('name',t.name_label||ptr(e,'Qual é o seu nome?','What is your name?'),'text',primaryName)+
  \`<div class="rsvp-question"><span class="field-label">\${ptr(e,'Você poderá comparecer?','Will you attend?')}</span><div class="rsvp-choice-grid" id="attendance-choice"><button type="button" data-attendance="yes">\${escape(t.yes_button||ptr(e,'Sim, estarei presente','Yes, I will attend'))}</button><button type="button" data-attendance="no">\${escape(t.no_button||ptr(e,'Não poderei ir','I cannot attend'))}</button></div><input type="hidden" name="response_status" value="\${escape(initialStatus)}"></div>
   <div id="decline-hint" class="decline-hint" hidden>\${escape(t.decline_hint||'')}</div>
   <div id="attending-section" hidden>\${companionGate}</div>\`+publicOptionalFields(e,guest||{});
 app.innerHTML=publicFrame(e,\`<p class="rsvp-welcome">\${escape(e.welcome_message||t.intro)}</p>\${form('public-rsvp',fields,ptr(e,'Enviar confirmação','Submit RSVP'))}\`);applyAppearance(e.appearance,e.brand);
 const formEl=document.querySelector('#public-rsvp');mountTurnstile(formEl,e.turnstile_sitekey);
 const status=formEl.querySelector('[name=response_status]'),attending=formEl.querySelector('#attending-section'),decline=formEl.querySelector('#decline-hint'),companionStatus=formEl.querySelector('[name=has_companion]'),companionGateEl=formEl.querySelector('#companion-gate'),companionSection=formEl.querySelector('#companion-section'),membersRoot=formEl.querySelector('#free-members'),countEl=formEl.querySelector('#companion-count');
 const syncCount=()=>{if(!membersRoot||!countEl)return;countEl.textContent=\`\${membersRoot.querySelectorAll('[data-companion-row]').length}/\${Math.max(0,limit-1)}\`;};
 const addCompanion=(type,value='')=>{
  if(!membersRoot)return;
  const current=membersRoot.querySelectorAll('[data-companion-row]').length;
  if(current>=Math.max(0,limit-1)){notice(ptr(e,\`O convite permite no máximo \${limit} pessoa(s), contando você.\`,\`This invitation allows up to \${limit} people including you.\`));return;}
  const row=document.createElement('label');row.className='companion-row';row.dataset.companionRow='1';
  row.innerHTML=\`<span class="field-label">\${type==='child'?ptr(e,'Nome da criança','Child name'):ptr(e,'Nome do adulto','Adult name')}</span><div class="companion-input-row"><input class="companion-name" data-type="\${type}" value="\${escape(value)}" placeholder="\${type==='child'?ptr(e,'Nome da criança','Child name'):ptr(e,'Nome do acompanhante','Companion name')}"><button type="button" class="companion-remove" aria-label="\${ptr(e,'Remover acompanhante','Remove guest')}">×</button></div>\`;
  row.querySelector('.companion-remove').onclick=()=>{row.remove();syncCount();};
  membersRoot.append(row);syncCount();
 };
 const setAttendance=value=>{
  status.value=value;formEl.querySelectorAll('[data-attendance]').forEach(b=>b.classList.toggle('active',b.dataset.attendance===value));
  const yes=value==='yes';attending.hidden=!yes;decline.hidden=value!=='no';
  if(yes&&companionGateEl)companionGateEl.hidden=false;
  if(!yes&&companionStatus){companionStatus.value='';formEl.querySelectorAll('[data-companion]').forEach(b=>b.classList.remove('active'));if(companionSection)companionSection.hidden=true;}
 };
 const setCompanion=value=>{
  if(!companionStatus)return;companionStatus.value=value;formEl.querySelectorAll('[data-companion]').forEach(b=>b.classList.toggle('active',b.dataset.companion===value));if(companionSection)companionSection.hidden=value!=='yes';
  if(value==='yes'&&membersRoot&&!membersRoot.children.length)addCompanion('adult');
 };
 formEl.querySelectorAll('[data-attendance]').forEach(b=>b.onclick=()=>setAttendance(b.dataset.attendance));
 formEl.querySelectorAll('[data-companion]').forEach(b=>b.onclick=()=>setCompanion(b.dataset.companion));
 formEl.querySelector('#add-adult')?.addEventListener('click',()=>addCompanion('adult'));
 formEl.querySelector('#add-child')?.addEventListener('click',()=>addCompanion('child'));
 companions.forEach(m=>addCompanion(m.person_type==='child'?'child':'adult',m.name));
 if(initialStatus)setAttendance(initialStatus);
 if(initialStatus==='yes'&&companionStatus&&companions.length)setCompanion('yes');
 else if(initialStatus==='yes'&&companionStatus&&!companions.length)setCompanion('no');
 submit('public-rsvp',async b=>{
  if(!b.response_status)throw Error(ptr(e,'Escolha se você poderá comparecer.','Please choose whether you will attend.'));
  if(b.response_status==='yes'&&limit>1&&!b.has_companion)throw Error(ptr(e,'Informe se você vai levar acompanhante.','Please tell us whether you are bringing anyone.'));
  const companionInputs=[...formEl.querySelectorAll('.companion-name')],blank=companionInputs.find(i=>!i.value.trim());
  if(b.response_status==='yes'&&b.has_companion==='yes'&&blank){blank.focus();throw Error(ptr(e,'Preencha ou remova o acompanhante que ficou sem nome.','Fill in or remove the guest with no name.'));}
  const companionMembers=b.response_status==='yes'&&b.has_companion==='yes'?companionInputs.map(i=>({name:i.value.trim(),person_type:i.dataset.type,attendance_status:'yes'})).filter(x=>x.name):[];
  if(b.response_status==='yes'&&b.has_companion==='yes'&&!companionMembers.length)throw Error(ptr(e,'Adicione pelo menos um acompanhante.','Add at least one companion.'));
  b.members=b.response_status==='yes'?[{name:b.name,person_type:'adult',attendance_status:'yes'},...companionMembers]:[{name:b.name,person_type:'adult',attendance_status:'no'}];
  if(b.members.length>limit)throw Error(ptr(e,\`O limite deste convite é de \${limit} pessoa(s).\`,\`This invitation allows up to \${limit} people.\`));
  delete b.has_companion;b.creation_request_id=requestId;if(guest?.token)b.token=guest.token;
  try{const result=await api(endpoint,'POST',b);publicSuccess(e,result.guest);}catch(err){resetTurnstile(formEl);throw Error(publicError(err.message,e));}
 });
}
function listRsvp(e,endpoint,g){
 const t=eventTexts(e),flex=e.list_behavior==='flexible',members=g.members||[];
 const memberRows=members.map(m=>`<div class="public-person"><div><strong>${escape(m.name)}</strong><small>${m.person_type==='child'?ptr(e,'Criança','Child'):ptr(e,'Adulto','Adult')}</small></div><select data-member-status="${m.id}"><option value="yes" ${m.attendance_status==='yes'?'selected':''}>${ptr(e,'Vai','Attending')}</option><option value="no" ${m.attendance_status==='no'?'selected':''}>${ptr(e,'Não vai','Not attending')}</option><option value="pending" ${m.attendance_status==='pending'?'selected':''}>${ptr(e,'Pendente','Pending')}</option></select></div>`).join('');
 const extra=flex?`<div id="limit-status" class="limit-status"></div><label><span class="field-label">${ptr(e,'Adicionar acompanhantes','Add guests')}</span><textarea name="new_members" placeholder="${ptr(e,'Acompanhante 1; adulto\\nAcompanhante 2; criança','Guest 1; adult\\nGuest 2; child')}"></textarea><small class="field-hint">${ptr(e,`Limite total: ${g.max_people}. Adultos: ${g.max_adults_allowed??'sem limite específico'} · Crianças: ${g.max_children_allowed??'sem limite específico'}.`,`Total limit: ${g.max_people}. Adults: ${g.max_adults_allowed??'no specific limit'} · Children: ${g.max_children_allowed??'no specific limit'}.`)}</small></label>`:'';
 app.innerHTML=publicFrame(e,`<p class="rsvp-welcome">${escape(e.welcome_message||t.intro)}</p><div class="public-family-title">${escape(g.group_label||g.name)}</div>${form('public-list',`<div class="public-person-list">${memberRows}</div>${extra}${publicOptionalFields(e,g)}`,ptr(e,'Enviar confirmação','Submit RSVP'))}`);applyAppearance(e.appearance,e.brand);
 const formEl=document.querySelector('#public-list');mountTurnstile(formEl,e.turnstile_sitekey);
 const syncLimits=()=>{if(!flex)return true;const statuses=[...formEl.querySelectorAll('[data-member-status]')],existingYes=statuses.map(x=>({status:x.value,member:members.find(m=>m.id===x.dataset.memberStatus)})).filter(x=>x.status==='yes'),added=parseMemberLines(formEl.querySelector('[name=new_members]')?.value||''),adults=existingYes.filter(x=>x.member?.person_type!=='child').length+added.filter(x=>x.person_type==='adult').length,children=existingYes.filter(x=>x.member?.person_type==='child').length+added.filter(x=>x.person_type==='child').length,total=adults+children,maxA=g.max_adults_allowed,maxC=g.max_children_allowed,ok=total<=g.max_people&&(maxA===null||maxA===undefined||adults<=Number(maxA))&&(maxC===null||maxC===undefined||children<=Number(maxC)),box=formEl.querySelector('#limit-status');if(box){box.classList.toggle('over',!ok);box.innerHTML=`<strong>${total}/${g.max_people} ${ptr(e,'vaga(s) usada(s)','spots used')}</strong><span>${ptr(e,`Adultos: ${adults}${maxA===null||maxA===undefined?'':`/${maxA}`} · Crianças: ${children}${maxC===null||maxC===undefined?'':`/${maxC}`}`,`Adults: ${adults}${maxA===null||maxA===undefined?'':`/${maxA}`} · Children: ${children}${maxC===null||maxC===undefined?'':`/${maxC}`}`)}</span>`;};return ok;};
 formEl.querySelectorAll('[data-member-status]').forEach(x=>x.onchange=syncLimits);formEl.querySelector('[name=new_members]')?.addEventListener('input',syncLimits);syncLimits();
 submit('public-list',async b=>{if(!syncLimits())throw Error(ptr(e,'A quantidade de pessoas ultrapassa o limite deste convite.','The number of guests exceeds this invitation limit.'));const current=members.map(m=>({...m,attendance_status:formEl.querySelector(`[data-member-status="${m.id}"]`).value})),added=flex?parseMemberLines(b.new_members).map(m=>({...m,attendance_status:'yes'})):[];b.members=[...current,...added];b.token=g.token;b.response_status=b.members.some(m=>m.attendance_status==='yes')?'yes':b.members.some(m=>m.attendance_status==='pending')?'pending':'no';try{const result=await api(endpoint,'POST',b);publicSuccess(e,result.guest);}catch(err){resetTurnstile(formEl);throw Error(publicError(err.message,e));}});
}
async function publicPage(studio,event){
 const invite=new URL(location.href).searchParams.get('invite'),endpoint=`/api/public/${encodeURIComponent(studio)}/${encodeURIComponent(event)}`,result=await api(endpoint+(invite?`?invite=${encodeURIComponent(invite)}`:'')),e=result.event,guest=result.guest;
 document.documentElement.lang=eventLang(e)==='en'?'en':'pt-BR';document.title=`${e.title} · ${eventLang(e)==='en'?'RSVP':'Confirmação de presença'}`;const t=eventTexts(e);
 if(e.deadline&&new Date(e.deadline).getTime()<Date.now()){app.innerHTML=publicFrame(e,`<div class="success-card"><h2>${escape(t.closed_title)}</h2><p>${ptr(e,'O prazo para responder a este evento terminou.','The response deadline for this event has passed.')}</p></div>`);applyAppearance(e.appearance,e.brand);return;}
 if(e.rsvp_mode==='list'&&!guest){app.innerHTML=publicFrame(e,`<p>${ptr(e,'Para responder, abra o link individual enviado pelos anfitriões.','Open the private invitation link sent by the hosts to RSVP.')}</p>`);applyAppearance(e.appearance,e.brand);return;}
 if(e.rsvp_mode==='list')listRsvp(e,`${endpoint}/rsvp`,guest);else freeRsvp(e,`${endpoint}/rsvp`,guest);
}
function applyAppearance(raw={},brand={}){
 const a={...DEFAULT_APPEARANCE,...raw},brandColor=/^#[a-f0-9]{6}$/i.test(brand?.color||'')?brand.color:'#a66f73';if(!/^#[a-f0-9]{6}$/i.test(a.button_color||''))a.button_color=brandColor;
 const root=document.documentElement,vars={accent:a.button_color,eventBg:a.background_color,eventCard:a.card_color,eventText:a.text_color,eventMuted:a.muted_color,eventButtonText:a.button_text_color,eventRadius:`${Number(a.card_radius)||22}px`,eventBlur:`${Number(a.card_blur)||0}px`,eventCardOpacity:String(Number(a.card_opacity)||.96),eventOverlayOpacity:String(Number(a.overlay_opacity)||0),eventOverlay:a.overlay_color||'#ffffff'};
 for(const [k,v] of Object.entries(vars))root.style.setProperty(`--${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}`,v);
 const shell=document.querySelector('.rsvp-shell');if(!shell)return;shell.classList.toggle('event-card-glass',a.card_style==='glass');shell.classList.toggle('event-card-solid',a.card_style==='solid');shell.querySelector('.event-media-layer')?.remove();
 if(safeMedia(a.background_url)){const layer=document.createElement('div');layer.className='event-media-layer';if(a.background_type==='video'){const v=document.createElement('video');v.src=a.background_url;v.autoplay=true;v.muted=true;v.loop=true;v.playsInline=true;layer.append(v);}else{const img=document.createElement('img');img.src=a.background_url;img.alt='';layer.append(img);}layer.dataset.position=a.background_position||'center';layer.dataset.x=a.background_x||'center';shell.prepend(layer);}
}
async function qrPage(raw){
 const q=await api(`/api/q/${encodeURIComponent(raw)}`);document.title=`QR de entrada · ${q.event_title}`;app.innerHTML=`<div class="rsvp-shell"><div class="rsvp-card qr-card"><span class="eyebrow">Entrada no evento</span><h1>${escape(q.event_title)}</h1><p class="qr-name">${escape(q.name)}</p><div class="qr-frame"><img class="qr" id="qr" alt="QR de entrada"></div><span class="status-chip ${q.checked_in?'success':'neutral'}">${q.checked_in?'Entrada já registrada':'Pronto para apresentar'}</span><p class="muted">${q.checked_in?'Este QR já foi utilizado no check-in.':'Apresente este QR na entrada do evento.'}</p></div></div>`;document.querySelector('#qr').src=await QRCode.toDataURL(location.href,{margin:2,width:460});
}
async function clientPage(raw){
 const endpoint=`/api/cliente/${encodeURIComponent(raw)}`,data=await api(endpoint),e=data.event,permissions=data.permissions,guests=markDuplicates(data.guests);
 const yes=guests.filter(g=>g.response_status==='yes'),people=yes.reduce((n,g)=>n+g.members.filter(m=>m.attendance_status==='yes').length,0),pending=guests.filter(g=>g.response_status==='pending').length,a=eventAppearance(e),texts=eventTexts(e),extra=eventExtra(e);
 const clientMedia=permissions.manage_appearance?(await api(`${endpoint}/media`)).media:[];
 const mediaCards=clientMedia.map(m=>`<div class="media-card"><div class="media-thumb">${m.mime_type.startsWith('video/')?`<video src="${mediaUrl(m.id)}" muted playsinline></video>`:`<img src="${mediaUrl(m.id)}" alt="">`}</div><div><strong>${escape(({background_image:'Fundo',background_video:'Vídeo',cover:'Capa',logo:'Logo',other:'Mídia'}[m.media_kind]||'Mídia'))}</strong><small>${escape(m.original_name||m.mime_type)}</small></div><div class="media-actions"><button class="secondary small" data-client-use-media="${m.id}" data-kind="${m.media_kind}">Usar</button><button class="quiet-danger small" data-client-delete-media="${m.id}">Remover</button></div></div>`).join('');
 document.title=`${e.title} · Painel do evento`;
 app.innerHTML=`<div class="client-shell"><section class="client-head"><span class="eyebrow">Painel privado do evento</span><h1>${escape(e.title)}</h1><p>Resumo compartilhado pela profissional responsável.</p></section>
 <section class="summary-grid"><article><span>Convites</span><strong>${guests.length}</strong><small>na lista</small></article><article><span>Confirmados</span><strong>${people}</strong><small>pessoas</small></article><article><span>Pendentes</span><strong>${pending}</strong><small>respostas</small></article></section>
 <div class="card section-card"><div class="section-row"><div><h2>Lista de convidados</h2><p>${permissions.manage_guests?'Você pode adicionar e ajustar convidados.':'Visualização para acompanhamento.'}</p></div><div class="row">${permissions.manage_guests?'<button class="secondary small" id="client-add">Adicionar família</button><button class="secondary small" id="client-bulk-add">Adicionar vários</button>':''}${permissions.view_messages?'<button class="secondary small" id="client-messages">Mensagens</button>':''}${permissions.export_guests?'<button class="secondary small" id="client-export">CSV</button><button class="secondary small" id="client-pdf">PDF</button>':''}</div></div>
 <div class="guest-toolbar client-guest-toolbar"><input id="client-search" placeholder="Buscar convidado ou acompanhante"><div class="filter-chips"><button class="active" data-client-filter="">Todos <b>${guests.length}</b></button><button data-client-filter="yes">Confirmados <b>${guests.filter(g=>g.response_status==='yes').length}</b></button><button data-client-filter="pending">Pendentes <b>${guests.filter(g=>g.response_status==='pending').length}</b></button><button data-client-filter="no">Não irão <b>${guests.filter(g=>g.response_status==='no').length}</b></button><button data-client-filter="duplicates">Duplicados <b>${guests.filter(g=>g.possible_duplicate).length}</b></button></div></div><div class="scroll"><table><thead><tr><th>Família</th><th>Status</th><th>Pessoas</th>${permissions.view_messages?'<th>Mensagem</th>':''}${permissions.manage_guests?'<th></th>':''}</tr></thead><tbody>${guests.map(g=>`<tr data-client-guest="${g.id}" data-name="${escape(normalizedName(g.name+' '+g.group_label+' '+g.members.map(m=>m.name).join(' ')))}" data-status="${g.response_status}" data-duplicate="${g.possible_duplicate?'1':'0'}"><td><strong>${escape(g.group_label||g.name)}</strong>${g.possible_duplicate?'<br><span class="duplicate-chip">Possível duplicado</span>':''}</td><td><span class="status-chip ${statusTone(g.response_status)}">${escape(labelStatus(g.response_status))}</span></td><td>${g.members.filter(m=>m.attendance_status==='yes').length}</td>${permissions.view_messages?`<td>${escape(g.message||'')}</td>`:''}${permissions.manage_guests?`<td><div class="table-actions"><button class="secondary small" data-client-edit="${g.id}">Editar</button><button class="quiet-danger small" data-client-delete="${g.id}">Lixeira</button></div></td>`:''}</tr>`).join('')}</tbody></table></div></div>
 ${(permissions.manage_event_details||permissions.manage_appearance||permissions.manage_texts)?`<section class="client-settings-grid">
 ${permissions.manage_event_details?`<div class="card section-card"><h2>Dados do evento</h2>${form('client-event',field('title','Nome do evento','text',e.title)+field('event_date','Data e hora','datetime-local',toLocalInput(e.event_date),false)+field('location','Local','text',e.location||'',false)+field('deadline','Prazo','datetime-local',toLocalInput(e.deadline),false)+`<div class="permission-list">${[['phone','Telefone'],['dietary','Restrição alimentar'],['notes','Observações'],['message','Mensagem']].map(([k,l])=>`<label class="check-label"><input type="checkbox" name="extra_${k}" ${extra[k]?'checked':''}> <span>${l}</span></label>`).join('')}</div>`,'Salvar dados')}</div>`:''}
 ${permissions.manage_appearance?`<div class="card section-card"><h2>Aparência e mídias</h2>${form('client-appearance',appearanceFields(a),'Salvar aparência')}<p class="save-state" id="client-appearance-save-state">✓ Tudo salvo</p><div class="appearance-preview-wrap"><span>Prévia do convidado</span><div id="client-appearance-preview"></div></div><div class="media-uploader"><label><span class="field-label">Tipo da mídia</span><select id="client-media-kind"><option value="background_image">Imagem de fundo</option><option value="background_video">Vídeo de fundo</option><option value="cover">Capa</option><option value="logo">Logo do evento</option><option value="other">Outra mídia</option></select></label><label class="upload-box"><span>Enviar arquivo</span><input id="client-upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"><small>Imagens até 10 MB; vídeos até 20 MB.</small></label><p id="client-media-result" class="field-hint"></p></div><div class="media-library">${mediaCards||'<p class="muted">Nenhuma mídia enviada.</p>'}</div></div>`:''}
 ${permissions.manage_texts?`<div class="card section-card"><h2>Textos</h2>${form('client-texts',Object.entries({eyebrow:'Rótulo',intro:'Introdução',name_label:'Pergunta do nome',yes_button:'Botão “sim”',no_button:'Botão “não”',decline_hint:'Texto após recusa',success_title:'Título de sucesso',success_message:'Mensagem de sucesso',decline_title:'Título de recusa',decline_message:'Mensagem de recusa',message_label:'Título da mensagem',message_placeholder:'Placeholder da mensagem',calendar_button:'Botão agenda',back_button:'Botão voltar',closed_title:'Prazo encerrado'}).map(([k,l])=>field(k,l,'text',texts[k]||'',false)).join('')+`<label><span class="field-label">Mensagem de boas-vindas</span><textarea name="welcome_message">${escape(e.welcome_message||'')}</textarea></label>`,'Salvar textos')}</div>`:''}
 </section>`:''}</div>`;

 if(permissions.manage_appearance)bindAppearancePreview('client-appearance-preview',document.querySelector('#client-appearance'),e,a,texts,'client-appearance-save-state');
 let clientFilter='';
 const applyClientFilter=()=>{const q=normalizedName(document.querySelector('#client-search')?.value||'');document.querySelectorAll('[data-client-guest]').forEach(row=>{const byName=!q||row.dataset.name.includes(q),byStatus=!clientFilter||(clientFilter==='duplicates'?row.dataset.duplicate==='1':row.dataset.status===clientFilter);row.hidden=!(byName&&byStatus);});};
 document.querySelector('#client-search')?.addEventListener('input',applyClientFilter);
 document.querySelectorAll('[data-client-filter]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-client-filter]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');clientFilter=btn.dataset.clientFilter;applyClientFilter();});
 click('client-export',()=>downloadCSV(guests));
 click('client-pdf',()=>exportEventPdf(e,guests,e.studio_name));
 click('client-messages',()=>showMessages(guests));
 click('client-add',()=>guestInternalEditor(e,null,`${endpoint}/guests`,()=>clientPage(raw),'client'));
 click('client-bulk-add',()=>openBulkAdd(e,`${endpoint}/guests`,()=>clientPage(raw)));
 document.querySelectorAll('[data-client-edit]').forEach(btn=>btn.onclick=()=>guestInternalEditor(e,guests.find(g=>g.id===btn.dataset.clientEdit),`${endpoint}/guests/${btn.dataset.clientEdit}`,()=>clientPage(raw),'client'));
 document.querySelectorAll('[data-client-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm('Enviar esta família para a lixeira?'))return;await api(`${endpoint}/guests/${btn.dataset.clientDelete}`,'DELETE');await clientPage(raw);});

 submit('client-event',async(_,formEl)=>{
  const fd=new FormData(formEl),extra_fields={};for(const k of Object.keys(DEFAULT_EXTRA_FIELDS))extra_fields[k]=fd.has(`extra_${k}`);
  await api(`${endpoint}/event`,'PATCH',{title:fd.get('title'),event_date:localToIso(fd.get('event_date')),location:fd.get('location'),deadline:localToIso(fd.get('deadline')),extra_fields});
  notice('Dados atualizados.');await clientPage(raw);
 });
 submit('client-appearance',async(_,formEl)=>{await api(`${endpoint}/event`,'PATCH',{appearance:collectAppearance(formEl,a)});window.onbeforeunload=null;notice('Aparência atualizada.');await clientPage(raw);});
 submit('client-texts',async(_,formEl)=>{const fd=new FormData(formEl),welcome_message=fd.get('welcome_message'),public_texts=Object.fromEntries([...fd.entries()].filter(([k])=>k!=='welcome_message'));await api(`${endpoint}/event`,'PATCH',{welcome_message,public_texts});notice('Textos atualizados.');await clientPage(raw);});

 const upload=document.querySelector('#client-upload');
 if(upload)upload.onchange=async ev=>{
  const file=ev.target.files[0];if(!file)return;
  const kind=document.querySelector('#client-media-kind').value,result=document.querySelector('#client-media-result');result.textContent='Enviando…';
  try{
   if(document.querySelector('#client-appearance-save-state')?.classList.contains('dirty')){ev.target.value='';notice('Salve as alterações visuais antes de enviar uma nova mídia.');return;}
   const data=await uploadBinary(`${endpoint}/media?kind=${encodeURIComponent(kind)}`,file,{'content-type':file.type,'x-file-name':encodeURIComponent(file.name)},n=>{result.textContent=n>=100?'Processando…':`Enviando ${n}%`;});
   const next={...a},url=data.media.url;
   if(kind==='background_image'||kind==='background_video'){next.background_type=kind==='background_video'?'video':'image';next.background_url=url;}
   else if(kind==='cover')next.cover_url=url;else if(kind==='logo')next.logo_url=url;
   await api(`${endpoint}/event`,'PATCH',{appearance:next});result.textContent='Mídia enviada e aplicada.';await clientPage(raw);
  }catch(err){result.textContent='';notice(err.message);}
 };
 document.querySelectorAll('[data-client-use-media]').forEach(btn=>btn.onclick=async()=>{
  if(document.querySelector('#client-appearance-save-state')?.classList.contains('dirty')){notice('Salve as alterações visuais antes de trocar a mídia.');return;}
  const next={...a},url=mediaUrl(btn.dataset.clientUseMedia),kind=btn.dataset.kind;
  if(kind==='background_image'||kind==='background_video'){next.background_type=kind==='background_video'?'video':'image';next.background_url=url;}
  else if(kind==='cover')next.cover_url=url;else if(kind==='logo')next.logo_url=url;
  await api(`${endpoint}/event`,'PATCH',{appearance:next});await clientPage(raw);
 });
 document.querySelectorAll('[data-client-delete-media]').forEach(btn=>btn.onclick=async()=>{
  if(document.querySelector('#client-appearance-save-state')?.classList.contains('dirty')){notice('Salve as alterações visuais antes de remover uma mídia.');return;}
  if(!confirm('Remover esta mídia?'))return;await api(`${endpoint}/media/${btn.dataset.clientDeleteMedia}`,'DELETE');await clientPage(raw);
 });
}

async function finances(){
 const b=await api('/api/billing'),monthly=b.studio.billing_mode==='monthly';
 const state=monthly?(b.studio.monthly_until?`Vigente até ${formatDate(b.studio.monthly_until)}`:'Aguardando pagamento'):`${b.studio.credits} crédito${b.studio.credits===1?'':'s'} disponível${b.studio.credits===1?'':'is'}`;
 const orders=b.orders.map(o=>`<tr><td>${formatDate(o.created_at)}</td><td>${o.kind==='monthly'?'Mensal':`${o.quantity} crédito${o.quantity===1?'':'s'}`}</td><td>${money(o.amount_cents)}</td><td><span class="status-chip ${statusTone(o.status)}">${escape(labelStatus(o.status))}</span>${o.status==='pending'&&o.checkout_url?`<br><a class="table-link" href="${escape(o.checkout_url)}">Retomar pagamento</a>`:''}</td></tr>`).join('');
 const orderCards=b.orders.map(o=>`<article class="purchase-card"><div><span>Plano</span><strong>${o.kind==='monthly'?'Mensal':`${o.quantity} crédito${o.quantity===1?'':'s'}`}</strong></div><div><span>Valor</span><strong>${money(o.amount_cents)}</strong></div><div><span>Data</span><strong>${formatDate(o.created_at)}</strong></div><div><span>Status</span><strong><span class="status-chip ${statusTone(o.status)}">${escape(labelStatus(o.status))}</span></strong></div>${o.status==='pending'&&o.checkout_url?`<a class="button secondary full-button" href="${escape(o.checkout_url)}">Retomar pagamento</a>`:''}</article>`).join('');
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">Financeiro</span><h1>Plano e créditos</h1><p>Escolha o formato que acompanha seu volume de eventos.</p></div><button class="secondary" id="refresh">Atualizar pagamentos</button></section>
 <div class="billing-banner"><div><span>Modalidade atual</span><strong>${monthly?'Mensal':'Créditos'}</strong><small>${escape(state)}</small></div><div class="billing-actions">${b.studio.subscription_id?'<button class="quiet-danger" id="cancel-subscription">Cancelar mensalidade</button>':''}</div></div>
 <section class="content-section"><div class="section-row"><div><h2>Escolha seu próximo plano</h2><p>Ao trocar de modalidade, créditos comprados continuam guardados.</p></div></div>${await plans(true)}</section>
 <section class="two-column-panels"><div class="card section-card finance-panel"><h2>Compras</h2>${b.orders.length?`<div class="finance-orders-table scroll"><table><thead><tr><th>Data</th><th>Plano</th><th>Valor</th><th>Status</th></tr></thead><tbody>${orders}</tbody></table></div><div class="finance-orders-mobile">${orderCards}</div>`:'<div class="empty-state compact"><p>Nenhuma compra registrada ainda.</p></div>'}</div><div class="card section-card finance-panel"><h2>Movimentação de créditos</h2>${b.ledger.length?b.ledger.map(l=>`<div class="ledger-row"><div><strong>${escape(ledgerLabel(l.reason))}</strong><span>${formatDate(l.created_at)}</span></div><b class="${l.delta>=0?'positive':'negative'}">${l.delta>0?'+':''}${l.delta}</b></div>`).join(''):'<div class="empty-state compact"><p>Nenhuma movimentação de créditos ainda.</p></div>'}</div></section>`;
 menuEvents();bindPlans(true);click('refresh',()=>finances());
 click('cancel-subscription',async()=>{if(!confirm('Cancelar a mensalidade e voltar para o modo de créditos?'))return;await api('/api/billing/cancel','POST',{});await finances();});
}

async function brand(){
 const s=user.studio,b=JSON.parse(s.brand||'{}'),color=b.color||'#a66f73';
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">Identidade</span><h1>Minha marca</h1><p>Essas informações ajudam a manter sua presença profissional nos eventos.</p></div></section><section class="brand-layout"><div class="card section-card">${form('brand',field('name','Nome da marca','text',s.name)+field('whatsapp','WhatsApp','tel',s.whatsapp)+field('color','Cor principal','color',color)+field('instagram','Instagram · opcional','text',b.instagram||'',false),'Salvar minha marca')}</div><aside class="brand-preview" id="brand-preview"><span>Prévia</span><div class="brand-preview-card"><i></i><small id="preview-name">${escape(s.name)}</small><h2>Confirmação de presença</h2><p>Seus clientes veem a identidade da sua marca em primeiro plano.</p><button type="button">Confirmar presença</button></div></aside></section>`;
 menuEvents();
 const colorInput=document.querySelector('[name=color]'),nameInput=document.querySelector('[name=name]'),preview=document.querySelector('#brand-preview'),previewName=document.querySelector('#preview-name');
 preview?.style.setProperty('--preview-accent',color);
 colorInput?.addEventListener('input',()=>preview.style.setProperty('--preview-accent',colorInput.value));
 nameInput?.addEventListener('input',()=>previewName.textContent=nameInput.value||'Sua marca');
 submit('brand',async x=>{await api('/api/brand','PATCH',{name:x.name,whatsapp:x.whatsapp,brand:{color:x.color,instagram:x.instagram}});notice('Marca atualizada.');});
}

async function account(adminMode=false){
 const {passkeys}=await api('/api/passkeys');
 const pureAdmin=adminMode||user.role==='super_admin'&&!user.impersonated_studio_id;
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">${pureAdmin?'Acesso administrativo':'Segurança'}</span><h1>${pureAdmin?'Meu acesso':'Minha conta'}</h1><p>${escape(user.email)}</p>${pureAdmin?'<small class="admin-role-note">Super Admin da Presença Confirmada · segurança desta conta</small>':''}</div></section><section class="account-grid"><div class="card section-card"><div class="section-row"><div><h2>Digital ou Face ID</h2><p>Use a segurança do seu próprio aparelho para entrar sem digitar a senha.</p></div></div><button id="register-passkey">Cadastrar este dispositivo</button><div class="device-list">${passkeys.length?passkeys.map(k=>`<div class="device-row"><div><strong>${escape(k.label)}</strong><span>Cadastrado em ${formatDate(k.created_at)}</span></div><button class="secondary small" data-remove="${escape(k.id)}">Remover</button></div>`).join(''):'<p class="muted">Nenhum dispositivo cadastrado ainda.</p>'}</div></div><div class="card section-card"><h2>Alterar senha</h2><p class="muted">Use pelo menos 8 caracteres.</p>${form('password',field('current_password','Senha atual','password')+field('password','Nova senha','password'),'Alterar senha')}<div class="danger-zone"><strong>Sessões abertas</strong><p>Use esta opção se entrou em um aparelho que não está mais com você.</p><button class="quiet-danger" id="logout-all">Sair de todos os dispositivos</button></div></div></section>`;
 menuEvents();
 click('register-passkey',async()=>{const x=await api('/api/passkeys/register/options','POST',{}),response=await startRegistration({optionsJSON:x.options});await api('/api/passkeys/register/verify','POST',{challenge_id:x.challenge_id,response,label:'Meu dispositivo'});await account(pureAdmin);});
 submit('password',async b=>{await api('/api/auth/password','POST',b);notice('Senha alterada.');});
 click('logout-all',async()=>{if(!confirm('Encerrar todas as sessões da sua conta?'))return;await api('/api/auth/logout-all','POST',{});goto('/app/login');});
 document.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api(`/api/passkeys/${encodeURIComponent(btn.dataset.remove)}`,'DELETE');await account(pureAdmin);}catch(e){notice(e.message);}}));
}

async function checkin(eventId){
 const base=`/api/events/${eventId}`,{event:e}=await api(base),{guests}=await api(`${base}/guests`),{checkins}=await api(`${base}/checkins`);
 const confirmed=guests.filter(g=>g.response_status==='yes');
 const manual=confirmed.map(g=>`<article class="checkin-guest" data-search="${escape((g.name+' '+g.members.map(m=>m.name).join(' ')).toLowerCase())}"><div><strong>${escape(g.name)}</strong><small>${g.members.filter(m=>m.attendance_status==='yes').length} pessoa${g.members.filter(m=>m.attendance_status==='yes').length===1?'':'s'} confirmada${g.members.filter(m=>m.attendance_status==='yes').length===1?'':'s'}</small></div><div class="checkin-actions">${e.checkin_mode==='family'?`<button class="small" data-check="${g.id}">Registrar família</button>`:g.members.filter(m=>m.attendance_status==='yes').map(m=>`<button class="small" data-check="${g.id}" data-member="${m.id}">${escape(m.name)}</button>`).join('')}</div></article>`).join('');
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">Check-in</span><h1>${escape(e.title)}</h1><p>Leia o QR ou registre a entrada manualmente.</p></div><a class="button secondary" href="/app/eventos/${eventId}">Voltar ao evento</a></section><section class="summary-grid"><article><span>Confirmados</span><strong>${confirmed.length}</strong><small>convites</small></article><article><span>Entradas</span><strong>${checkins.length}</strong><small>já registradas</small></article><article><span>Modo</span><strong class="summary-text">${e.checkin_mode==='family'?'Por família':'Por pessoa'}</strong><small>leitura de QR</small></article></section><section class="checkin-grid"><div class="card scanner-card"><h2>Ler QR</h2><p>A câmera traseira funciona melhor para leitura na entrada.</p><button id="camera">Abrir câmera</button><video id="video" autoplay playsinline muted hidden></video><button class="secondary full-button" id="stop-camera" hidden>Fechar câmera</button><div class="manual-code"><span>Ou cole o link/código</span>${form('scan',field('token','Código ou link do QR'),'Registrar entrada')}</div></div><div class="card section-card"><h2>Busca manual</h2><input id="guest-search" aria-label="Buscar convidado" placeholder="Buscar convidado ou acompanhante"><div class="checkin-list">${manual||'<div class="empty-state compact"><p>Nenhuma presença confirmada para registrar.</p></div>'}</div></div></section><div class="card section-card"><div class="section-row"><div><h2>Entradas recentes</h2><p>Registros mais recentes aparecem primeiro.</p></div></div>${checkins.length?checkins.map(x=>`<div class="checkin-history"><strong>${escape(x.name)}</strong><span>${formatDate(x.created_at,true)}</span></div>`).join(''):'<div class="empty-state compact"><p>Nenhuma entrada registrada ainda.</p></div>'}</div>`;
 menuEvents();
 let stream,running=false;
 const stop=()=>{running=false;stream?.getTracks().forEach(t=>t.stop());const video=document.querySelector('#video'),close=document.querySelector('#stop-camera');if(video)video.hidden=true;if(close)close.hidden=true;};
 const register=async payload=>{const r=await api(`${base}/checkins`,'POST',payload);stop();await checkin(eventId);notice(r.already_checked_in?'Entrada já estava registrada.':'Entrada registrada!');};
 submit('scan',async b=>{let raw=b.token.trim();try{raw=new URL(raw).pathname.split('/').pop();}catch{}await register({token:raw});});
 document.querySelectorAll('[data-check]').forEach(btn=>btn.addEventListener('click',async()=>{try{await register({guest_id:btn.dataset.check,member_id:btn.dataset.member});}catch(err){notice(err.message);}}));
 document.querySelector('#guest-search').addEventListener('input',ev=>document.querySelectorAll('[data-search]').forEach(row=>row.hidden=!row.dataset.search.includes(ev.target.value.toLowerCase())));
 click('stop-camera',stop);window.addEventListener('pagehide',stop,{once:true});
 click('camera',async()=>{if(!('BarcodeDetector'in window))throw Error('Este navegador não oferece leitura automática. Use a busca manual ou cole o link do QR.');stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});const video=document.querySelector('#video');video.srcObject=stream;video.hidden=false;document.querySelector('#stop-camera').hidden=false;await video.play();running=true;const detector=new BarcodeDetector({formats:['qr_code']});const loop=async()=>{if(!running)return;try{const codes=await detector.detect(video);if(codes.length){let raw=codes[0].rawValue;try{raw=new URL(raw).pathname.split('/').pop();}catch{}await register({token:raw});return;}}catch{}setTimeout(loop,250);};loop();});
}

async function adminPage(){
 if(user.role!=='super_admin')throw Error('Acesso restrito à administração.');
 const {studios}=await api('/api/admin/studios'),active=studios.filter(s=>s.status==='active').length,totalEvents=studios.reduce((n,s)=>n+Number(s.event_count||0),0);
 const rows=studios.map(s=>`<tr data-studio="${escape(s.name.toLowerCase())}"><td><strong>${escape(s.name)}</strong><br><span class="status-chip ${statusTone(s.status)}">${escape(labelStatus(s.status))}</span></td><td>${escape(labelStatus(s.billing_mode))}<br><small>${s.credits} crédito${s.credits===1?'':'s'}</small></td><td>${s.event_count}</td><td><div class="table-actions"><button class="small" data-enter="${s.id}">Acessar</button><button class="secondary small" data-status="${s.id}" data-value="${s.status==='active'?'suspended':'active'}">${s.status==='active'?'Suspender':'Reativar'}</button><button class="secondary small" data-reset="${s.id}">Recuperar acesso</button></div></td></tr>`).join('');
 const cards=studios.map(s=>`<article class="admin-studio-card" data-studio="${escape((s.name+' '+(s.owner_name||'')+' '+(s.owner_email||'')).toLowerCase())}"><div class="admin-studio-head"><div><span class="admin-account-type">Conta de conviteira</span><strong>${escape(s.name)}</strong><small>${s.owner_name?`Responsável: ${escape(s.owner_name)} · `:''}${escape(labelStatus(s.billing_mode))} · ${s.credits} crédito${s.credits===1?'':'s'} · ${s.event_count} evento${Number(s.event_count)===1?'':'s'}</small></div><span class="status-chip ${statusTone(s.status)}">${escape(labelStatus(s.status))}</span></div><div class="admin-studio-actions"><button data-enter="${s.id}">Acessar como suporte</button><button class="secondary" data-status="${s.id}" data-value="${s.status==='active'?'suspended':'active'}">${s.status==='active'?'Suspender':'Reativar'}</button><button class="secondary" data-reset="${s.id}">Recuperar acesso</button></div></article>`).join('');
 app.innerHTML=menu()+`<section class="app-page-head admin-page-head"><div><span class="eyebrow">Administração da plataforma</span><h1>Visão da plataforma</h1><p>Contas de conviteiras, eventos, pagamentos e auditoria em um só lugar.</p></div><div class="admin-identity"><span>Seu acesso</span><strong>${escape(user.name)}</strong><small>Super Admin da Presença Confirmada</small></div></section><section class="summary-grid"><article><span>Contas</span><strong>${studios.length}</strong><small>cadastradas</small></article><article><span>Ativas</span><strong>${active}</strong><small>em operação</small></article><article><span>Eventos</span><strong>${totalEvents}</strong><small>criados</small></article></section><div class="card section-card"><div class="section-row"><div><h2>Contas de conviteiras</h2><p>Estas são contas clientes da plataforma. Acessar uma delas inicia um modo de suporte temporário.</p></div></div><input id="studio-search" placeholder="Buscar marca" aria-label="Buscar marca"><div class="admin-studio-mobile">${cards}</div><div class="admin-studio-table scroll"><table><thead><tr><th>Marca</th><th>Plano</th><th>Eventos</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div><div id="reset-link" class="admin-link"></div></div><section class="two-column-panels"><div class="card section-card"><h2>Ajuste de créditos</h2><p class="muted">Todo ajuste manual fica registrado na auditoria.</p>${form('adjust',select('studio_id','Conviteira',studios.map(s=>[s.id,s.name]),studios[0]?.id)+field('delta','Quantidade','number')+field('reason','Motivo do ajuste'),'Aplicar ajuste')}</div><div class="card section-card"><h2>Relatórios rápidos</h2><p class="muted">Consulte dados globais sem entrar em cada conta.</p><div class="admin-report-actions"><button id="global-finances">Financeiro</button><button class="secondary" id="global-events">Eventos</button><button class="secondary" id="audit">Auditoria</button></div><div id="admin-result"></div></div></section>`;
 menuEvents();
 submit('adjust',async b=>{await api(`/api/admin/studios/${b.studio_id}/credits`,'POST',b);await adminPage();});
 document.querySelector('#studio-search')?.addEventListener('input',ev=>document.querySelectorAll('[data-studio]').forEach(row=>row.hidden=!row.dataset.studio.includes(ev.target.value.toLowerCase())));
 document.querySelectorAll('[data-enter]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api('/api/admin/impersonate','POST',{studio_id:btn.dataset.enter});goto('/app');}catch(e){notice(e.message);}}));
 document.querySelectorAll('[data-status]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api(`/api/admin/studios/${btn.dataset.status}`,'PATCH',{status:btn.dataset.value});await adminPage();}catch(e){notice(e.message);}}));
 document.querySelectorAll('[data-reset]').forEach(btn=>btn.addEventListener('click',async()=>{try{const b=await api(`/api/admin/studios/${btn.dataset.reset}/reset-link`,'POST',{});const target=document.querySelector('#reset-link');target.innerHTML=`<strong>Link temporário de recuperação</strong><input value="${escape(b.url)}" readonly>`;target.querySelector('input').select();}catch(e){notice(e.message);}}));
 const renderReport=(type,b)=>{
  const el=document.querySelector('#admin-result');
  if(type==='financeiro'){el.innerHTML=b.orders?.length?`<div class="scroll report-table"><table><thead><tr><th>Marca</th><th>Data</th><th>Plano</th><th>Valor</th><th>Status</th></tr></thead><tbody>${b.orders.slice(0,100).map(o=>`<tr><td>${escape(o.studio_name)}</td><td>${formatDate(o.created_at)}</td><td>${o.kind==='monthly'?'Mensal':`${o.quantity} créditos`}</td><td>${money(o.amount_cents)}</td><td>${escape(labelStatus(o.status))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Nenhuma compra registrada.</p>';return;}
  if(type==='events'){el.innerHTML=b.events?.length?`<div class="scroll report-table"><table><thead><tr><th>Marca</th><th>Evento</th><th>Data</th><th>Status</th></tr></thead><tbody>${b.events.slice(0,100).map(x=>`<tr><td>${escape(x.studio_name)}</td><td>${escape(x.title)}</td><td>${formatDate(x.event_date)}</td><td>${escape(labelStatus(x.status))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Nenhum evento registrado.</p>';return;}
  el.innerHTML=b.audit?.length?`<div class="audit-list">${b.audit.slice(0,100).map(x=>`<div><strong>${escape(x.action)}</strong><span>${formatDate(x.created_at,true)}</span></div>`).join('')}</div>`:'<p class="muted">Nenhum registro de auditoria.</p>';
 };
 for(const [button,path]of [['global-finances','financeiro'],['global-events','events'],['audit','audit']])click(button,async()=>renderReport(path,await api(`/api/admin/${path}`)));
}

async function main(){
 const path=location.pathname.replace(/\/$/,'')||'/';
 if(path==='/'||path==='/planos'||path==='/termos'||path==='/privacidade')setShell('public');
 else if(['/app/login','/app/cadastro','/app/reset'].includes(path))setShell('auth');
 else if(path.startsWith('/q/')||path.startsWith('/cliente/')||(!(path==='/app'||path.startsWith('/app/'))&&!(path==='/admin'||path.startsWith('/admin/'))))setShell('event');
 else setShell('app');

 if(path==='/')return landing();
 if(path==='/planos'){app.innerHTML=`<section class="plans-hero"><span class="hero-kicker">PLANOS SEM COMPLICAÇÃO</span><h1>Escolha o ritmo da sua agenda.</h1><p>Compre créditos quando precisar ou use a mensalidade para criar eventos sem limite enquanto ela estiver vigente.</p></section>${await plans()}<p class="plans-footnote">Créditos já comprados continuam guardados. Cada novo evento usa 1 crédito quando sua modalidade ativa for créditos.</p>`;bindPlans(false);return;}
 if(path==='/termos'||path==='/privacidade'){app.innerHTML=`<article class="legal-page"><span class="eyebrow">Documento</span><h1>${path==='/termos'?'Termos de uso':'Privacidade'}</h1><p class="legal-lead">${path==='/termos'?'Regras gerais para uso da plataforma Presença Confirmada.':'Como os dados são tratados na plataforma Presença Confirmada.'}</p><section><h2>${path==='/termos'?'Uso da plataforma':'Dados utilizados'}</h2><p>${path==='/termos'?'A plataforma organiza confirmações de presença e entradas em eventos. A profissional responsável pela conta deve utilizar dados de convidados de forma autorizada e apenas para a finalidade do evento.':'A plataforma pode tratar nome, contato, respostas, acompanhantes, restrições alimentares e mensagens fornecidas para organizar o evento.'}</p></section><section><h2>${path==='/termos'?'Planos e pagamentos':'Segurança e fornecedores'}</h2><p>${path==='/termos'?'Cada evento consome um crédito quando a modalidade ativa é créditos. Na modalidade mensal, novos eventos podem ser criados enquanto a mensalidade estiver vigente. Pagamentos e estornos são processados pelo Mercado Pago.':'Passkeys armazenam apenas chaves públicas na plataforma; dados biométricos permanecem no dispositivo. Dados de cartão são processados pelo Mercado Pago. Quando a proteção anti-spam estiver ativada em um evento, a verificação Turnstile da Cloudflare também poderá processar dados técnicos necessários para distinguir acessos legítimos de abuso.'}</p></section><div class="draft-notice">A identificação legal da operadora, contato de suporte, política final de retenção e procedimento de exclusão serão inseridos antes da abertura comercial.</div></article>`;return;}
 if(['/app/login','/app/cadastro','/app/reset'].includes(path))return authPage(path);
 let m=path.match(/^\/q\/([^/]+)$/);if(m)return qrPage(m[1]);
 m=path.match(/^\/cliente\/([^/]+)$/);if(m)return clientPage(m[1]);
 if(!(path==='/app'||path.startsWith('/app/')) && !(path==='/admin'||path.startsWith('/admin/'))){m=path.match(/^\/([^/]+)\/([^/]+)$/);if(m)return publicPage(m[1],m[2]);throw Error('Página não encontrada.');}
 try{user=(await api('/api/auth/me')).user;}catch{goto('/app/login');return;}
 const pureAdmin=user.role==='super_admin'&&!user.impersonated_studio_id;
 if(pureAdmin&&!['/admin','/admin/conta'].includes(path)){goto('/admin');return;}
 if(path==='/admin')return adminPage();
 if(path==='/admin/conta')return account(true);
 if(path==='/app')return dashboard();
 if(path==='/app/financeiro')return finances();
 if(path==='/app/marca')return brand();
 if(path==='/app/conta')return account();
 if(path==='/app/eventos/novo')return newEvent();
 m=path.match(/^\/app\/eventos\/([^/]+)(?:\/(checkin))?$/);if(m)return m[2]?checkin(m[1]):eventPage(m[1]);
 throw Error('Página não encontrada.');
}
main().catch(e=>{if(document.body.dataset.shell==='event')app.innerHTML=`<div class="rsvp-shell"><div class="rsvp-card success-card"><span class="eyebrow">Não disponível</span><h1>Não foi possível abrir</h1><p>${escape(e.message)}</p></div></div>`;else app.innerHTML=`<div class="card"><h1>Não foi possível abrir esta página</h1><p class="error">${escape(e.message)}</p><a href="/app">Voltar à plataforma</a></div>`;});
