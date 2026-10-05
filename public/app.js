import {startRegistration,startAuthentication} from '@simplewebauthn/browser';
import QRCode from 'qrcode';
const app=document.querySelector('#app');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>c?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100):'Em breve';
const labelStatus=value=>({
 active:'Ativo',inactive:'Inativo',archived:'Arquivado',
 pending:'Pendente',approved:'Aprovado',rejected:'Recusado',cancelled:'Cancelado',
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
const cleanSlug=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
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
const statusTone=value=>['active','approved','yes','authorized'].includes(String(value))?'success':['pending','in_process','in_mediation','paused'].includes(String(value))?'warning':['inactive','archived','cancelled','refunded','charged_back','rejected','no','suspended'].includes(String(value))?'danger':'neutral';
const ledgerLabel=value=>({purchase:'Compra de créditos',refund:'Estorno de créditos',event:'Evento criado'}[String(value)]||String(value??'Movimentação'));
function setShell(mode){
 document.body.dataset.shell=mode;
 const nav=document.querySelector('header nav');
 if(!nav)return;
 if(mode==='app')nav.innerHTML='<a href="/app">Painel</a>';
 else if(mode==='event')nav.innerHTML='';
 else nav.innerHTML='<a href="/planos">Planos</a><a class="nav-login" href="/app/login">Entrar</a>';
}
const goto=path=>{location.href=path;};
let user;

const menu=()=>{
 const p=location.pathname;
 const item=(href,label,active)=>`<a class="${active?'active':''}" href="${href}">${label}</a>`;
 return `<div class="app-nav-wrap"><nav class="app-tabs" aria-label="Navegação da plataforma">
  ${item('/app','Eventos',p==='/app'||p.startsWith('/app/eventos'))}
  ${item('/app/financeiro','Financeiro',p==='/app/financeiro')}
  ${item('/app/marca','Minha marca',p==='/app/marca')}
  ${item('/app/conta','Minha conta',p==='/app/conta')}
  ${user?.role==='super_admin'?item('/admin','Administração',p==='/admin'):''}
  <button id="logout" class="nav-logout">Sair</button>
 </nav></div>${user?.impersonated_studio_id?'<div class="impersonation">Você está acessando uma conta como administradora. <button id="stop-impersonation">Encerrar acesso</button></div>':''}`;
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

async function dashboard(){
 if(!user.studio){goto('/admin');return;}
 const {events}=await api('/api/events'),s=user.studio;
 const active=events.filter(e=>e.status==='active').length;
 const billing=s.billing_mode==='credits'?{title:`${s.credits} crédito${s.credits===1?'':'s'}`,text:'disponíveis para novos eventos'}:{title:'Plano mensal',text:s.monthly_until?`vigente até ${formatDate(s.monthly_until)}`:'aguardando confirmação do pagamento'};
 const cards=events.map(e=>`<article class="event-card">
   <div class="event-card-top"><span class="status-chip ${statusTone(e.status)}">${escape(labelStatus(e.status))}</span><span class="event-date">${e.event_date?escape(formatDate(e.event_date)):'Data não informada'}</span></div>
   <h2>${escape(e.title)}</h2>
   <p>${e.location?escape(e.location):'Local ainda não informado'}</p>
   <div class="event-card-actions"><a class="button small" href="/app/eventos/${e.id}">Gerenciar</a><a class="text-action" href="/${s.slug}/${e.slug}" target="_blank" rel="noopener">Abrir RSVP</a></div>
  </article>`).join('');
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">${escape(s.name)}</span><h1>Seus eventos</h1><p>Uma visão rápida do que está ativo e do que vem a seguir.</p></div><a class="button primary" href="/app/eventos/novo">Novo evento</a></section>
 <section class="summary-grid"><article><span>Eventos</span><strong>${events.length}</strong><small>no total</small></article><article><span>Ativos</span><strong>${active}</strong><small>recebendo respostas</small></article><article><span>Seu plano</span><strong class="summary-text">${escape(billing.title)}</strong><small>${escape(billing.text)}</small></article></section>
 <section class="content-section"><div class="section-row"><div><h2>Todos os eventos</h2><p>Abra um evento para ver convidados, personalização e check-in.</p></div></div>${cards?`<div class="event-grid">${cards}</div>`:`<div class="empty-state"><div class="empty-mark">✓</div><h2>Seu primeiro evento começa aqui</h2><p>Crie a celebração, personalize o RSVP e compartilhe o link com seu cliente.</p><a class="button" href="/app/eventos/novo">Criar primeiro evento</a></div>`}</section>`;
 menuEvents();
}
function eventFields(e={}){
 const basics=field('title','Nome do evento','text',e.title)+field('event_date','Data e hora · opcional','datetime-local',toLocalInput(e.event_date),false)+field('location','Local · opcional','text',e.location,false)+field('deadline','Prazo para confirmar · opcional','datetime-local',toLocalInput(e.deadline),false);
 const options=select('rsvp_mode','Como os convidados confirmam',[['free','Link livre'],['list','Link individual por convite']],e.rsvp_mode||'free')+field('max_people','Limite de pessoas por convite','number',e.max_people||10)+select('checkin_mode','Check-in por QR',[['off','Desativado'],['family','Um QR por família'],['individual','Um QR por pessoa']],e.checkin_mode||'off');
 if(e.id)return basics+options+select('status','Situação',[['active','Ativo'],['inactive','Inativo'],['archived','Arquivado']],e.status);
 return basics+`<label><span class="field-label">Endereço do evento<b class="required-mark" aria-hidden="true">*</b></span><input name="slug" required aria-required="true" autocapitalize="none" spellcheck="false"><small class="field-hint">Link público: …/<strong id="event-url-preview">seu-evento</strong></small></label><details class="advanced-options"><summary>Opções do RSVP e check-in</summary><div class="advanced-body">${options}</div></details>`;
}
async function newEvent(){
 app.innerHTML=menu()+`<section class="flow-intro compact"><span class="eyebrow">Novo evento</span><h1>Crie a base da celebração</h1><p>Você pode completar e alterar os detalhes depois. O evento usa um crédito ou sua mensalidade vigente.</p></section><div class="card setup-card">${form('event',eventFields(),'Criar evento')}</div>`;
 menuEvents();
 bindAutoSlug('title','slug','event-url-preview');
 submit('event',async b=>{b.event_date=localToIso(b.event_date);b.deadline=localToIso(b.deadline);const {event}=await api('/api/events','POST',b);goto(`/app/eventos/${event.id}`);});
}

async function eventPage(eventId){
 const {event:e}=await api(`/api/events/${eventId}`),{guests}=await api(`/api/events/${eventId}/guests`),base=`/api/events/${eventId}`,confirmed=guests.filter(g=>g.response_status==='yes');
 const link=`/${user.studio.slug}/${e.slug}`,appearance=JSON.parse(e.appearance||'{}'),studioBrand=JSON.parse(user.studio.brand||'{}');
 const confirmedPeople=confirmed.reduce((n,g)=>n+g.members.filter(m=>m.attendance_status==='yes').length,0);
 const pending=guests.filter(g=>g.response_status==='pending').length;
 const guestRows=guests.map(g=>`<article class="guest-row" data-name="${escape((g.name+' '+g.members.map(m=>m.name).join(' ')).toLowerCase())}">
   <div class="guest-main"><div><strong>${escape(g.name)}</strong><span class="status-chip ${statusTone(g.response_status)}">${escape(labelStatus(g.response_status))}</span></div><p>${g.members.length?g.members.map(m=>escape(m.name)).join(', '):'Sem acompanhantes informados'}</p>${g.message?`<small>Mensagem: ${escape(g.message)}</small>`:''}</div>
   <div class="guest-actions"><a class="text-action" href="${link}?invite=${encodeURIComponent(g.token)}" target="_blank" rel="noopener">Abrir convite</a><button class="secondary small" data-edit="${g.id}">Editar</button><button class="quiet-danger small" data-cancel="${g.id}">Cancelar</button></div>
  </article>`).join('');
 app.innerHTML=menu()+`<section class="app-page-head event-head"><div><span class="eyebrow">${escape(user.studio.name)}</span><div class="title-with-status"><h1>${escape(e.title)}</h1><span class="status-chip ${statusTone(e.status)}">${escape(labelStatus(e.status))}</span></div><p>${e.event_date?escape(formatDate(e.event_date,true)):'Data ainda não informada'}${e.location?` · ${escape(e.location)}`:''}</p></div><div class="head-actions"><a class="button" href="${link}" target="_blank" rel="noopener">Abrir RSVP</a><button class="secondary" id="copy-public">Copiar link</button>${e.checkin_mode!=='off'?`<a class="button secondary" href="/app/eventos/${eventId}/checkin">Check-in</a>`:''}</div></section>
 <section class="summary-grid event-summary"><article><span>Convites</span><strong>${guests.length}</strong><small>cadastrados</small></article><article><span>Confirmados</span><strong>${confirmed.length}</strong><small>${confirmedPeople} pessoa${confirmedPeople===1?'':'s'}</small></article><article><span>Pendentes</span><strong>${pending}</strong><small>aguardando resposta</small></article></section>
 <section class="workspace-grid">
  <div class="workspace-main">
   <div class="card section-card"><div class="section-row"><div><h2>Convidados e famílias</h2><p>Busque, adicione ou edite respostas deste evento.</p></div><button class="secondary small" id="export">Exportar CSV</button></div>
    <div class="search-box"><input id="search" placeholder="Buscar convidado ou acompanhante" aria-label="Buscar convidado"></div>
    <div id="guests">${guestRows||'<div class="empty-state compact"><h3>Nenhum convidado cadastrado</h3><p>Adicione uma família manualmente ou importe sua lista.</p></div>'}</div>
    <div class="inline-tools"><details><summary>Adicionar convidado ou família</summary>${form('add-guest',field('name','Nome do responsável')+field('phone','Telefone · opcional','tel','',false)+field('max_people','Limite da família','number',e.max_people),'Adicionar convidado')}</details>
    <details><summary>Importar lista em CSV</summary>${form('import','<label><span class="field-label">Lista CSV<b class="required-mark">*</b></span><textarea name="csv" required placeholder="nome,telefone,max_pessoas\nMaria,62999999999,4"></textarea><small class="field-hint">Use nome,telefone,max_pessoas. O formato antigo name,phone,max_people também continua aceito. Até 300 registros por importação.</small></label>','Importar lista')}</details></div>
   </div>
  </div>
  <aside class="workspace-side">
   <details class="management-card" open><summary>Detalhes do evento</summary><div class="management-body">${form('settings',eventFields(e),'Salvar alterações')}</div></details>
   <details class="management-card"><summary>Visual e mensagem</summary><div class="management-body">${form('appearance',field('color','Cor principal','color',appearance.color||studioBrand.color||'#a66f73')+`<input type="hidden" name="background" value="${escape(appearance.background||'')}">`+`<label><span class="field-label">Mensagem de boas-vindas</span><textarea name="welcome_message" placeholder="Escreva uma mensagem curta para os convidados.">${escape(e.welcome_message)}</textarea></label>`,'Salvar visual')}<label class="upload-box"><span>Imagem de fundo · opcional</span><input id="upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><small>JPG, PNG, WebP ou AVIF. Até 20 MB.</small></label><p id="media-result" class="field-hint"></p></div></details>
   <details class="management-card"><summary>Acesso do cliente</summary><div class="management-body"><p class="muted">Este link privado permite que seu cliente acompanhe a lista sem acessar sua conta profissional.</p>${form('client','<label class="check-label"><input type="checkbox" name="manage_guests"> <span>Permitir que o cliente altere respostas</span></label>','Gerar novo link')}<p id="client-result" class="client-link"><a href="/cliente/${encodeURIComponent(e.client_token)}" target="_blank" rel="noopener">Abrir painel atual do cliente</a></p></div></details>
  </aside>
 </section>`;
 menuEvents();
 click('copy-public',async()=>{await navigator.clipboard.writeText(location.origin+link);notice('Link do RSVP copiado.');});
 submit('settings',async b=>{b.event_date=localToIso(b.event_date);b.deadline=localToIso(b.deadline);await api(base,'PATCH',b);notice('Evento atualizado.');});
 submit('add-guest',async b=>{await api(`${base}/guests`,'POST',b);await eventPage(eventId);});
 submit('import',async b=>{const rows=parseCSV(b.csv),headers=rows.shift()?.map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase()),header=headers?.join(','),valid=header==='nome,telefone,max_pessoas'||header==='name,phone,max_people';if(!valid)throw Error('Use o cabeçalho nome,telefone,max_pessoas.');await api(`${base}/guests`,'POST',{guests:rows.filter(r=>r.some(Boolean)).map(r=>({name:r[0],phone:r[1],max_people:r[2]||e.max_people}))});await eventPage(eventId);});
 submit('appearance',async b=>{await api(base,'PATCH',{appearance:{color:b.color,background:b.background},welcome_message:b.welcome_message});notice('Visual salvo.');});
 submit('client',async b=>{const result=await api(`${base}/client-link`,'POST',{manage_guests:!!b.manage_guests});const target=document.querySelector('#client-result');target.innerHTML=`<a href="${escape(result.url)}" target="_blank" rel="noopener">Abrir novo painel do cliente</a>`;});
 document.querySelector('#search').addEventListener('input',ev=>document.querySelectorAll('[data-name]').forEach(row=>row.hidden=!row.dataset.name.includes(ev.target.value.toLowerCase())));
 document.querySelectorAll('[data-cancel]').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('Cancelar a presença deste convite?'))return;try{await api(`${base}/guests/${btn.dataset.cancel}`,'DELETE');await eventPage(eventId);}catch(err){notice(err.message);}}));
 document.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>guestEditor(e,guests.find(g=>g.id===btn.dataset.edit),`${base}/guests/${btn.dataset.edit}`,()=>eventPage(eventId))));
 click('export',()=>downloadCSV(guests));
 document.querySelector('#upload').addEventListener('change',async ev=>{const file=ev.target.files[0];if(!file)return;const result=document.querySelector('#media-result');result.textContent='Enviando…';try{const r=await fetch(`${base}/media`,{method:'POST',headers:{'content-type':file.type},body:file});const b=await r.json();if(!r.ok)throw Error(b.error);const visual=document.querySelector('#appearance');visual.querySelector('[name=background]').value=b.url;await api(base,'PATCH',{appearance:{color:visual.querySelector('[name=color]').value,background:b.url},welcome_message:visual.querySelector('[name=welcome_message]').value});result.textContent='Imagem enviada e salva.';}catch(err){result.textContent='';notice(err.message);}});
}
function parseCSV(input){const rows=[[]];let current='',quoted=false;for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){rows.at(-1).push(current);current='';}else if(c==='\n'&&!quoted){rows.at(-1).push(current.replace(/\r$/,''));current='';rows.push([]);}else current+=c;}if(quoted)throw Error('CSV com aspas não fechadas.');rows.at(-1).push(current.replace(/\r$/,''));return rows;}
function downloadCSV(guests){const cell=v=>`"${String(v??'').replace(/^[=+@\-]/,"'function downloadCSV(guests){const cell=v=>`"${String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')}"`;const data=[['name','phone','status','people','message'],...guests.map(g=>[g.name,g.phone,g.response_status,g.members.filter(m=>m.attendance_status==='yes').length,g.message])].map(r=>r.map(cell).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff',data],{type:'text/csv;charset=utf-8'}));a.download='convidados.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}").replace(/"/g,'""')}"`;const data=[['nome','telefone','status','pessoas','mensagem'],...guests.map(g=>[g.name,g.phone,labelStatus(g.response_status),g.members.filter(m=>m.attendance_status==='yes').length,g.message])].map(r=>r.map(cell).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff',data],{type:'text/csv;charset=utf-8'}));a.download='convidados.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

function guestEditor(e,g,endpoint,done,mode=false){
 const publicMode=mode===true,clientMode=mode==='client',externalMode=publicMode||clientMode;
 const members=g?.members?.filter(m=>m.attendance_status!=='no')||[];
 const max=Math.min(e.max_people,g?.max_people||e.max_people);
 const details=[e.event_date?formatDate(e.event_date,true):'',e.location||'',e.deadline?`Confirme até ${formatDate(e.deadline,true)}`:''].filter(Boolean).join(' · ');
 const fields=field('name','Nome do responsável','text',g?.name||'')+field('phone','WhatsApp · opcional','tel',g?.phone||'',false)+select('response_status','Sua resposta',[['yes','Sim, estarei presente'],['no','Não poderei comparecer'],['pending','Ainda não sei']],g?.response_status||'yes')+`<label><span class="field-label">Pessoas deste convite<b class="required-mark">*</b></span><textarea name="members" required placeholder="Um nome por linha">${escape(members.length?members.map(m=>`${m.name}${m.person_type==='child'?'; criança':''}`).join('\n'):g?.name||'')}</textarea><small class="field-hint">Um nome por linha. Para identificar criança, use “; criança” depois do nome. Limite: ${max} pessoa${max===1?'':'s'}.</small></label><label><span class="field-label">Restrições alimentares · opcional</span><textarea name="dietary" placeholder="Ex.: sem lactose, alergia a amendoim…">${escape(g?.dietary||'')}</textarea></label><label><span class="field-label">Mensagem · opcional</span><textarea name="message" placeholder="Deixe uma mensagem para os anfitriões.">${escape(g?.message||'')}</textarea></label>`;
 app.innerHTML=`${externalMode?'':menu()}<div class="${externalMode?'rsvp-shell':'edit-shell'}"><div class="rsvp-card"><div class="rsvp-brand">${escape(e.studio_name||user?.studio?.name||'Confirmação de presença')}</div><span class="eyebrow">Confirmação de presença</span><h1>${escape(e.title)}</h1>${details?`<p class="event-meta">${escape(details)}</p>`:''}<p class="rsvp-welcome">${escape(e.welcome_message||'Confirme sua presença para os anfitriões prepararem tudo com carinho.')}</p>${form('rsvp',fields,publicMode?'Enviar resposta':'Salvar resposta')}</div></div>`;
 if(!externalMode)menuEvents();
 const responsible=document.querySelector('[name="name"]'),membersField=document.querySelector('[name="members"]');
 if(responsible&&membersField&&!members.length&&!membersField.value.trim()){
  let auto=true,last='';
  responsible.addEventListener('input',()=>{if(auto){membersField.value=responsible.value;last=responsible.value;}});
  membersField.addEventListener('input',()=>{auto=!membersField.value.trim()||membersField.value===last;});
 }
 submit('rsvp',async b=>{
  b.members=b.members.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const parts=line.split(';');const prior=g?.members?.find(m=>m.name===parts[0].trim());return {name:parts[0].trim(),person_type:parts[1]?.trim().toLowerCase()==='criança'?'child':'adult',...(prior?{id:prior.id}:{})};});
  if(g?.token)b.token=g.token;
  const result=await api(endpoint,publicMode?'POST':'PATCH',b);
  if(publicMode){
   const guest=result.guest;
   const qrs=guest.qr_token?[{name:guest.name,token:guest.qr_token}]:guest.members.filter(m=>m.qr_token).map(m=>({name:m.name,token:m.qr_token}));
   app.innerHTML=`<div class="rsvp-shell"><div class="rsvp-card success-card"><div class="success-mark">✓</div><span class="eyebrow">${guest.response_status==='yes'?'Tudo certo':'Resposta recebida'}</span><h1>${guest.response_status==='yes'?'Presença confirmada!':'Resposta registrada'}</h1><p>Obrigada por responder. Você pode voltar a este convite se precisar alterar sua resposta.</p><a class="button secondary full-button" href="${location.pathname}?invite=${guest.token}">Alterar minha resposta</a>${qrs.length?`<div class="qr-links"><h2>QR de entrada</h2><p>Guarde o QR de cada pessoa para apresentar na entrada.</p>${qrs.map(q=>`<a href="/q/${q.token}">${escape(q.name)}</a>`).join('')}</div>`:''}</div></div>`;
  }else await done();
 });
}
async function publicPage(studio,event){
 const invite=new URL(location.href).searchParams.get('invite'),endpoint=`/api/public/${encodeURIComponent(studio)}/${encodeURIComponent(event)}`;
 const {event:e,guest}=await api(endpoint+(invite?`?invite=${encodeURIComponent(invite)}`:''));
 document.title=`${e.title} · Confirmação de presença`;
 if(e.deadline&&new Date(e.deadline).getTime()<Date.now()){app.innerHTML=`<div class="rsvp-shell"><div class="rsvp-card success-card"><span class="eyebrow">Prazo encerrado</span><h1>As confirmações foram encerradas</h1><p>O prazo para responder a este evento terminou em ${escape(formatDate(e.deadline,true))}.</p></div></div>`;applyAppearance(e.appearance,e.brand);return;}
 if(e.rsvp_mode==='list'&&!guest){app.innerHTML=`<div class="rsvp-shell"><div class="rsvp-card"><span class="eyebrow">Convite individual</span><h1>${escape(e.title)}</h1><p>Para responder, abra o link individual enviado pelos anfitriões.</p></div></div>`;applyAppearance(e.appearance,e.brand);return;}
 guestEditor(e,guest,`${endpoint}/rsvp`,null,true);
 applyAppearance(e.appearance,e.brand);
}
function applyAppearance(a={},brand={}){
 const color=/^#[a-f0-9]{6}$/i.test(a?.color)?a.color:/^#[a-f0-9]{6}$/i.test(brand?.color)?brand.color:null;
 if(color)document.documentElement.style.setProperty('--accent',color);
 if(/^\/media\/[a-f0-9-]+$/.test(a?.background)){app.style.backgroundImage=`linear-gradient(rgba(255,255,255,.84),rgba(255,255,255,.9)),url("${a.background}")`;app.classList.add('event-background');}
}

async function qrPage(raw){
 const q=await api(`/api/q/${encodeURIComponent(raw)}`);
 document.title=`QR de entrada · ${q.event_title}`;
 app.innerHTML=`<div class="rsvp-shell"><div class="rsvp-card qr-card"><span class="eyebrow">Entrada no evento</span><h1>${escape(q.event_title)}</h1><p class="qr-name">${escape(q.name)}</p><div class="qr-frame"><img class="qr" id="qr" alt="QR de entrada"></div><span class="status-chip ${q.checked_in?'success':'neutral'}">${q.checked_in?'Entrada já registrada':'Pronto para apresentar'}</span><p class="muted">${q.checked_in?'Este QR já foi utilizado no check-in.':'Apresente este QR na entrada do evento.'}</p></div></div>`;
 document.querySelector('#qr').src=await QRCode.toDataURL(location.href,{margin:2,width:460});
}

async function clientPage(raw){
 const {event:e,guests,permissions}=await api(`/api/cliente/${encodeURIComponent(raw)}`);
 const yes=guests.filter(g=>g.response_status==='yes'),people=yes.reduce((n,g)=>n+g.members.filter(m=>m.attendance_status==='yes').length,0),pending=guests.filter(g=>g.response_status==='pending').length;
 document.title=`${e.title} · Painel do evento`;
 app.innerHTML=`<div class="client-shell"><section class="client-head"><span class="eyebrow">Painel privado do evento</span><h1>${escape(e.title)}</h1><p>Resumo das confirmações compartilhado pela profissional responsável.</p></section><section class="summary-grid"><article><span>Convites</span><strong>${guests.length}</strong><small>na lista</small></article><article><span>Confirmados</span><strong>${people}</strong><small>pessoas</small></article><article><span>Pendentes</span><strong>${pending}</strong><small>respostas</small></article></section><div class="card section-card"><div class="section-row"><div><h2>Lista de convidados</h2><p>${permissions.manage_guests?'Você pode abrir e ajustar as respostas autorizadas.':'Visualização somente para acompanhamento.'}</p></div></div><div class="scroll"><table><thead><tr><th>Nome</th><th>Presença</th><th>Pessoas</th><th>Mensagem</th>${permissions.manage_guests?'<th></th>':''}</tr></thead><tbody>${guests.map(g=>`<tr><td><strong>${escape(g.name)}</strong></td><td><span class="status-chip ${statusTone(g.response_status)}">${escape(labelStatus(g.response_status))}</span></td><td>${g.members.filter(m=>m.attendance_status==='yes').length}</td><td>${escape(g.message||'')}</td>${permissions.manage_guests?`<td><button class="secondary small" data-client-edit="${g.id}">Editar</button></td>`:''}</tr>`).join('')}</tbody></table></div>${guests.length?'':'<div class="empty-state compact"><p>Nenhum convidado cadastrado ainda.</p></div>'}</div></div>`;
 document.querySelectorAll('[data-client-edit]').forEach(btn=>btn.addEventListener('click',()=>guestEditor(e,guests.find(g=>g.id===btn.dataset.clientEdit),`/api/cliente/${encodeURIComponent(raw)}/guests/${btn.dataset.clientEdit}`,()=>clientPage(raw),'client')));
}

async function finances(){
 const b=await api('/api/billing'),monthly=b.studio.billing_mode==='monthly';
 const state=monthly?(b.studio.monthly_until?`Vigente até ${formatDate(b.studio.monthly_until)}`:'Aguardando pagamento'):`${b.studio.credits} crédito${b.studio.credits===1?'':'s'} disponível${b.studio.credits===1?'':'is'}`;
 const orders=b.orders.map(o=>`<tr><td>${formatDate(o.created_at)}</td><td>${o.kind==='monthly'?'Mensal':`${o.quantity} crédito${o.quantity===1?'':'s'}`}</td><td>${money(o.amount_cents)}</td><td><span class="status-chip ${statusTone(o.status)}">${escape(labelStatus(o.status))}</span>${o.status==='pending'&&o.checkout_url?`<br><a class="table-link" href="${escape(o.checkout_url)}">Retomar pagamento</a>`:''}</td></tr>`).join('');
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">Financeiro</span><h1>Plano e créditos</h1><p>Escolha o formato que acompanha seu volume de eventos.</p></div><button class="secondary" id="refresh">Atualizar pagamentos</button></section>
 <div class="billing-banner"><div><span>Modalidade atual</span><strong>${monthly?'Mensal':'Créditos'}</strong><small>${escape(state)}</small></div><div class="billing-actions">${b.studio.subscription_id?'<button class="quiet-danger" id="cancel-subscription">Cancelar mensalidade</button>':''}</div></div>
 <section class="content-section"><div class="section-row"><div><h2>Escolha seu próximo plano</h2><p>Ao trocar de modalidade, créditos comprados continuam guardados.</p></div></div>${await plans(true)}</section>
 <section class="two-column-panels"><div class="card section-card"><h2>Compras</h2>${b.orders.length?`<div class="scroll"><table><thead><tr><th>Data</th><th>Plano</th><th>Valor</th><th>Status</th></tr></thead><tbody>${orders}</tbody></table></div>`:'<div class="empty-state compact"><p>Nenhuma compra registrada ainda.</p></div>'}</div><div class="card section-card"><h2>Movimentação de créditos</h2>${b.ledger.length?b.ledger.map(l=>`<div class="ledger-row"><div><strong>${escape(ledgerLabel(l.reason))}</strong><span>${formatDate(l.created_at)}</span></div><b class="${l.delta>=0?'positive':'negative'}">${l.delta>0?'+':''}${l.delta}</b></div>`).join(''):'<div class="empty-state compact"><p>Nenhuma movimentação de créditos ainda.</p></div>'}</div></section>`;
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

async function account(){
 const {passkeys}=await api('/api/passkeys');
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">Segurança</span><h1>Minha conta</h1><p>${escape(user.email)}</p></div></section><section class="account-grid"><div class="card section-card"><div class="section-row"><div><h2>Digital ou Face ID</h2><p>Use a segurança do seu próprio aparelho para entrar sem digitar a senha.</p></div></div><button id="register-passkey">Cadastrar este dispositivo</button><div class="device-list">${passkeys.length?passkeys.map(k=>`<div class="device-row"><div><strong>${escape(k.label)}</strong><span>Cadastrado em ${formatDate(k.created_at)}</span></div><button class="secondary small" data-remove="${escape(k.id)}">Remover</button></div>`).join(''):'<p class="muted">Nenhum dispositivo cadastrado ainda.</p>'}</div></div><div class="card section-card"><h2>Alterar senha</h2><p class="muted">Use pelo menos 8 caracteres.</p>${form('password',field('current_password','Senha atual','password')+field('password','Nova senha','password'),'Alterar senha')}<div class="danger-zone"><strong>Sessões abertas</strong><p>Use esta opção se entrou em um aparelho que não está mais com você.</p><button class="quiet-danger" id="logout-all">Sair de todos os dispositivos</button></div></div></section>`;
 menuEvents();
 click('register-passkey',async()=>{const x=await api('/api/passkeys/register/options','POST',{}),response=await startRegistration({optionsJSON:x.options});await api('/api/passkeys/register/verify','POST',{challenge_id:x.challenge_id,response,label:'Meu dispositivo'});await account();});
 submit('password',async b=>{await api('/api/auth/password','POST',b);notice('Senha alterada.');});
 click('logout-all',async()=>{if(!confirm('Encerrar todas as sessões da sua conta?'))return;await api('/api/auth/logout-all','POST',{});goto('/app/login');});
 document.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api(`/api/passkeys/${encodeURIComponent(btn.dataset.remove)}`,'DELETE');await account();}catch(e){notice(e.message);}}));
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
 app.innerHTML=menu()+`<section class="app-page-head"><div><span class="eyebrow">Administração</span><h1>Visão da plataforma</h1><p>Contas, eventos, pagamentos e auditoria em um só lugar.</p></div></section><section class="summary-grid"><article><span>Contas</span><strong>${studios.length}</strong><small>cadastradas</small></article><article><span>Ativas</span><strong>${active}</strong><small>em operação</small></article><article><span>Eventos</span><strong>${totalEvents}</strong><small>criados</small></article></section><div class="card section-card"><div class="section-row"><div><h2>Conviteiras</h2><p>Acesse uma conta para prestar suporte sem compartilhar senha.</p></div></div><input id="studio-search" placeholder="Buscar marca" aria-label="Buscar marca"><div class="scroll"><table><thead><tr><th>Marca</th><th>Plano</th><th>Eventos</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div><div id="reset-link" class="admin-link"></div></div><section class="two-column-panels"><div class="card section-card"><h2>Ajuste de créditos</h2><p class="muted">Todo ajuste manual fica registrado na auditoria.</p>${form('adjust',select('studio_id','Conviteira',studios.map(s=>[s.id,s.name]),studios[0]?.id)+field('delta','Quantidade','number')+field('reason','Motivo do ajuste'),'Aplicar ajuste')}</div><div class="card section-card"><h2>Relatórios rápidos</h2><p class="muted">Consulte dados globais sem entrar em cada conta.</p><div class="admin-report-actions"><button id="global-finances">Financeiro</button><button class="secondary" id="global-events">Eventos</button><button class="secondary" id="audit">Auditoria</button></div><div id="admin-result"></div></div></section>`;
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
 if(path==='/termos'||path==='/privacidade'){app.innerHTML=`<article class="legal-page"><span class="eyebrow">Documento</span><h1>${path==='/termos'?'Termos de uso':'Privacidade'}</h1><p class="legal-lead">${path==='/termos'?'Regras gerais para uso da plataforma Presença Confirmada.':'Como os dados são tratados na plataforma Presença Confirmada.'}</p><section><h2>${path==='/termos'?'Uso da plataforma':'Dados utilizados'}</h2><p>${path==='/termos'?'A plataforma organiza confirmações de presença e entradas em eventos. A profissional responsável pela conta deve utilizar dados de convidados de forma autorizada e apenas para a finalidade do evento.':'A plataforma pode tratar nome, contato, respostas, acompanhantes, restrições alimentares e mensagens fornecidas para organizar o evento.'}</p></section><section><h2>${path==='/termos'?'Planos e pagamentos':'Segurança e fornecedores'}</h2><p>${path==='/termos'?'Cada evento consome um crédito quando a modalidade ativa é créditos. Na modalidade mensal, novos eventos podem ser criados enquanto a mensalidade estiver vigente. Pagamentos e estornos são processados pelo Mercado Pago.':'Passkeys armazenam apenas chaves públicas na plataforma; dados biométricos permanecem no dispositivo. Dados de cartão são processados pelo Mercado Pago.'}</p></section><div class="draft-notice">A identificação legal da operadora, contato de suporte, política final de retenção e procedimento de exclusão serão inseridos antes da abertura comercial.</div></article>`;return;}
 if(['/app/login','/app/cadastro','/app/reset'].includes(path))return authPage(path);
 let m=path.match(/^\/q\/([^/]+)$/);if(m)return qrPage(m[1]);
 m=path.match(/^\/cliente\/([^/]+)$/);if(m)return clientPage(m[1]);
 if(!(path==='/app'||path.startsWith('/app/')) && !(path==='/admin'||path.startsWith('/admin/'))){m=path.match(/^\/([^/]+)\/([^/]+)$/);if(m)return publicPage(m[1],m[2]);throw Error('Página não encontrada.');}
 try{user=(await api('/api/auth/me')).user;}catch{goto('/app/login');return;}
 if(path==='/admin')return adminPage();
 if(path==='/app')return dashboard();
 if(path==='/app/financeiro')return finances();
 if(path==='/app/marca')return brand();
 if(path==='/app/conta')return account();
 if(path==='/app/eventos/novo')return newEvent();
 m=path.match(/^\/app\/eventos\/([^/]+)(?:\/(checkin))?$/);if(m)return m[2]?checkin(m[1]):eventPage(m[1]);
 throw Error('Página não encontrada.');
}
main().catch(e=>{if(document.body.dataset.shell==='event')app.innerHTML=`<div class="rsvp-shell"><div class="rsvp-card success-card"><span class="eyebrow">Não disponível</span><h1>Não foi possível abrir</h1><p>${escape(e.message)}</p></div></div>`;else app.innerHTML=`<div class="card"><h1>Não foi possível abrir esta página</h1><p class="error">${escape(e.message)}</p><a href="/app">Voltar à plataforma</a></div>`;});
