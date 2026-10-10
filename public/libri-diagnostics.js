/* Diagnóstico administrativo Libri. Nenhum dado enviado automaticamente. */
(() => {
  'use strict';
  const APP = "Presença Confirmada";
  const HOST_SELECTOR = "body[data-shell='app']>header nav";
  const GATE_SELECTOR = ".admin-nav-wrap";
  const BEFORE_SELECTOR = "";
  const isAdminPath = () => /^\/admin(?:\/conta)?\/?$/.test(location.pathname);
  const KEY = 'libri-bug-report-' + "rsvp-plataforma";
  const MAX = 8;
  const events = [];
  const SAFE_PARTS = new Set(['api','admin','events','orders','media','upload','uploads','photos','dashboard',
    'finance','financeiro','payments','settings','clients','client','guests','messages','logs',
    'profile','auth','passkeys','session','audit','analytics','checkout','status','events',
    'collections','memberships','subscriptions','users','devices','summary','resumo',
    'config','report','reports','forms','confirm','checkin','check-in','photos','assets',
    'credits','credit','billing','search','preview','statistics','plans','health','history']);
  const NAME_LIST = new Set(['TypeError','ReferenceError','SyntaxError','RangeError','URIError','AggregateError']);
  function safeRoute(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input?.url, location.origin);
      if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return '(API externa/indisponível)';
      return url.pathname.split('/').filter(Boolean).slice(0,6)
        .map(part => SAFE_PARTS.has(part) ? part : ':id').join('/').replace(/^/, '/');
    } catch { return '(rota não identificada)'; }
  }
  function safeEvent(raw) {
    if (!['HTTP','REDE','JS','PROMISE'].includes(raw?.type)) return null;
    const result = {time: new Date().toISOString(), type: raw.type};
    if (raw.type === 'HTTP' || raw.type === 'REDE') {
      result.route = safeRoute(raw.route);
      result.method = ['GET','POST','PUT','PATCH','DELETE'].includes(raw.method) ? raw.method : 'GET';
      result.status = Number.isInteger(raw.status) && raw.status >= 400 && raw.status <= 599 ? raw.status : 0;
    } else result.name = NAME_LIST.has(raw.name) ? raw.name : 'Erro JavaScript';
    return result;
  }
  function record(raw) {
    if (!isAdminPath() || !document.querySelector(GATE_SELECTOR)) return;
    const item = safeEvent(raw);
    if (!item) return;
    events.push(item);
    if (events.length > MAX) events.shift();
    try { sessionStorage.setItem(KEY, JSON.stringify(events)); } catch {}
  }
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    if (Array.isArray(stored)) for (const e of stored.slice(-MAX)) {
      if (!['HTTP','REDE','JS','PROMISE'].includes(e?.type)) continue;
      if (!e.time || !Number.isFinite(Date.parse(e.time))) continue;
      const clean = safeEvent(e);
      if (clean) { clean.time = new Date(e.time).toISOString(); events.push(clean); }
    }
  } catch {}
  window.addEventListener('error', e => record({type:'JS',name:e.error?.name}));
  window.addEventListener('unhandledrejection', e => record({type:'PROMISE',name:e.reason?.name}));

  // Monitoramento passivo: não modifica argumentos, respostas, cabeçalhos nem corpo da API.
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const watched = isAdminPath() && !!document.querySelector(GATE_SELECTOR);
    const route = watched ? safeRoute(args[0]) : '';
    const method = String(args[1]?.method || args[0]?.method || 'GET').toUpperCase();
    return originalFetch.apply(this, args).then(response => {
      if (watched && response.status >= 400 && response.status !== 401 && response.status !== 403)
        record({type:'HTTP',route:args[0],method,status:response.status});
      return response;
    }, error => {
      if (watched) record({type:'REDE',route:args[0],method});
      throw error;
    });
  };

  let dialog;
  function makeDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'libri-bug-dialog';
    dialog.setAttribute('aria-labelledby','libri-bug-title');
    dialog.innerHTML = '<header><div><h2 id="libri-bug-title">🐞 Diagnóstico</h2>' +
      '<p>Somente informações técnicas, sem dados de clientes.</p></div>' +
      '<button class="libri-bug-close" type="button" aria-label="Fechar">×</button></header>' +
      '<div class="libri-bug-main"><textarea readonly aria-label="Relatório de diagnóstico"></textarea>' +
      '<p class="libri-bug-feedback" aria-live="polite"></p></div>' +
      '<footer class="libri-bug-footer"><button class="libri-bug-copy" type="button">Copiar relatório</button>' +
      '<button class="libri-bug-close-footer" type="button">Fechar</button></footer>';
    document.body.appendChild(dialog);
    const close = () => dialog.close();
    dialog.querySelector('.libri-bug-close').addEventListener('click', close);
    dialog.querySelector('.libri-bug-close-footer').addEventListener('click', close);
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
    dialog.querySelector('.libri-bug-copy').addEventListener('click', async () => {
      const text = dialog.querySelector('textarea');
      const feedback = dialog.querySelector('.libri-bug-feedback');
      try {
        await navigator.clipboard.writeText(text.value);
        feedback.textContent = 'Copiado! Cole na conversa para investigar.';
      } catch {
        feedback.textContent = 'Selecione e copie o texto manualmente.';
        text.focus(); text.select();
      }
    });
  }
  function report() {
    const ua = navigator.userAgent;
    const platform = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone/iPad' :
      /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'macOS' : 'Outro';
    const parts = [APP + ' | DIAGNÓSTICO', 'Data: ' + new Date().toISOString(),
      'Tela: Administrativa', 'Plataforma: ' + platform,
      'Viewport: ' + window.innerWidth + ' x ' + window.innerHeight,
      'Falhas recentes nesta aba:'];
    if (!events.length) parts.push('Nenhuma falha registrada nesta aba.');
    for (const e of events) parts.push(e.time + ' | ' + e.type + ' | ' +
      (e.route ? e.method + ' ' + e.route + ' | ' + (e.status || 'sem resposta') :
       e.name));
    parts.push('', 'Sem nomes, números, links privados, tokens, CPF, conteúdo de pedidos ou dados de pacientes.',
      'Relatório local: não é enviado automaticamente.');
    return parts.join('\n');
  }
  function mount() {
    if (!isAdminPath() || !document.querySelector(GATE_SELECTOR)) {
      document.querySelector('.libri-bug-trigger')?.remove();
      return;
    }
    const host = document.querySelector(HOST_SELECTOR);
    if (!host || host.querySelector('.libri-bug-trigger')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'libri-bug-trigger';
    btn.title = 'Ver diagnóstico técnico';
    btn.setAttribute('aria-label', 'Ver diagnóstico técnico');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.textContent = '🐞';
    btn.addEventListener('click', () => {
      if (!dialog) makeDialog();
      dialog.querySelector('textarea').value = report();
      dialog.querySelector('.libri-bug-feedback').textContent = '';
      dialog.showModal();
    });
    const before = BEFORE_SELECTOR && host.querySelector(BEFORE_SELECTOR);
    if (before) host.insertBefore(btn,before);
    else host.appendChild(btn);
  }
  const observer = new MutationObserver(mount);
  observer.observe(document.body,{subtree:true,childList:true});
  mount();
})();
