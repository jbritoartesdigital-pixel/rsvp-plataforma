// Só inicializar em sessão confirmada de Super Admin.
// Não intercepta fetch, não toca em pagamentos nem serializa dados de cliente.
let active = false;
const failures = [];
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const jsNames = new Set(['TypeError','ReferenceError','SyntaxError','RangeError','URIError','AggregateError']);
const publicNames = new Set(['api','admin','auth','studios','studio','overview','financeiro','finance','audit',
  'usage','health','account','conta','me','session','login','logout','payments','events','passkeys',
  'credits','subscriptions','billing','analytics','status','reconcile','notifications','settings']);
const MAX = 8;
const isAdminPath = () => location.pathname === '/admin' || location.pathname === '/admin/conta';

export function safeDiagnosticRoute(path) {
  try {
    const url = new URL(path, 'https://admin.invalid');
    if (url.origin !== 'https://admin.invalid' || !url.pathname.startsWith('/api/'))
      return '(rota externa)';
    return '/' + url.pathname.split('/').filter(Boolean).slice(0, 7)
      .map(piece => publicNames.has(piece) ? piece : ':id').join('/');
  } catch {
    return '(rota indisponível)';
  }
}
function saveFailure(item) {
  if (!active || !isAdminPath()) return;
  failures.push({time: new Date().toISOString(), ...item});
  if (failures.length > MAX) failures.shift();
}
// Mantém o contrato de erro da aplicação: só registra código/método/rota anonimizada.
export function recordAdminApiFailure(path, method, status) {
  if (!active || !isAdminPath()) return;
  saveFailure({
    type: Number.isInteger(status) && status >= 400 && status <= 599 ? 'HTTP' : 'REDE',
    route: safeDiagnosticRoute(path),
    method: methods.has(method) ? method : 'GET',
    status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 0,
  });
}
const platform = () => {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone/iPad';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os/i.test(ua)) return 'macOS';
  return 'Outro';
};
function report() {
  const lines = ['PRESENÇA CONFIRMADA | DIAGNÓSTICO ADMINISTRATIVO',
    'Gerado em: ' + new Date().toISOString(),
    'Área: Administração', 'Plataforma: ' + platform(),
    'Viewport: ' + innerWidth + ' x ' + innerHeight,
    'Erros recentes desta sessão:'];
  if (!failures.length) lines.push('Nenhuma falha identificada nesta sessão.');
  for (const err of failures) {
    if (err.type === 'HTTP' || err.type === 'REDE') {
      lines.push(err.time + ' | ' + err.type + ' | ' + err.method + ' '
        + err.route + ' | ' + (err.status || 'sem resposta'));
    } else lines.push(err.time + ' | ' + err.type + ' | ' + err.name);
  }
  lines.push('','Sem dados pessoais, senhas, tokens, links privados ou mensagens de erro.',
    'Este relatório não é transmitido automaticamente.');
  return lines.join('\n');
}
async function copyReport(value) {
  if (!navigator.clipboard?.writeText) return false;
  try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
}
function dialogForDiagnostics() {
  const modal = document.createElement('dialog');
  modal.className = 'libri-admin-diag-modal';
  modal.setAttribute('aria-labelledby', 'libri-admin-diag-title');
  modal.innerHTML = `<div class="libri-admin-diag-head">
    <div><h2 id="libri-admin-diag-title">🐞 Diagnóstico</h2>
    <p>Informações técnicas, sem dados de clientes.</p></div>
    <button class="libri-admin-diag-x" type="button" aria-label="Fechar">×</button>
  </div><div class="libri-admin-diag-content">
    <textarea readonly spellcheck="false" aria-label="Relatório de diagnóstico"></textarea>
    <p class="libri-admin-diag-feedback" role="status"></p>
  </div><div class="libri-admin-diag-actions">
    <button class="libri-admin-diag-send" type="button">Enviar ao ChatGPT</button>
    <button class="libri-admin-diag-copy" type="button">Copiar relatório</button>
    <button class="libri-admin-diag-close" type="button">Fechar</button>
  </div>`;
  document.body.append(modal);
  const field = modal.querySelector('textarea');
  const feedback = modal.querySelector('.libri-admin-diag-feedback');
  modal.querySelector('.libri-admin-diag-x').addEventListener('click', () => modal.close());
  modal.querySelector('.libri-admin-diag-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  modal.querySelector('.libri-admin-diag-copy').addEventListener('click', async () => {
    if (await copyReport(field.value)) feedback.textContent = 'Copiado. Cole aqui na conversa.';
    else { feedback.textContent = 'Selecione o texto e copie manualmente.'; field.focus(); field.select(); }
  });
  modal.querySelector('.libri-admin-diag-send').addEventListener('click', async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({title: 'Presença Confirmada | Diagnóstico', text: field.value});
        feedback.textContent = 'Compartilhamento concluído no aplicativo escolhido.';
        return;
      } catch (error) {
        if (error?.name === 'AbortError') { feedback.textContent = 'Compartilhamento cancelado.'; return; }
      }
    }
    if (await copyReport(field.value)) {
      feedback.textContent = 'Copiado! Abra o ChatGPT e cole na conversa.';
      window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
    } else {
      feedback.textContent = 'Selecione e copie o relatório para enviar ao ChatGPT.';
      field.focus(); field.select();
    }
  });
  return modal;
}
export function initAdminDiagnostics() {
  if (active || !isAdminPath()) return;
  const header = document.querySelector('body[data-shell="app"] > header');
  if (!header) return;
  active = true;
  addEventListener('error', e => saveFailure({type:'JS',name:jsNames.has(e.error?.name)?e.error.name:'Erro JavaScript'}));
  addEventListener('unhandledrejection', e => saveFailure({type:'PROMISE',name:jsNames.has(e.reason?.name)?e.reason.name:'Erro JavaScript'}));
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'libri-admin-diag-trigger';
  button.className = 'libri-admin-diag-trigger';
  button.title = 'Ver diagnóstico técnico';
  button.setAttribute('aria-label', 'Ver diagnóstico técnico');
  button.setAttribute('aria-haspopup', 'dialog');
  button.textContent = '🐞';
  header.append(button);
  let modal;
  button.addEventListener('click', () => {
    if (!modal) {
      modal = dialogForDiagnostics();
      modal.addEventListener('close', () => button.focus());
    }
    modal.querySelector('textarea').value = report();
    modal.querySelector('.libri-admin-diag-feedback').textContent = '';
    modal.showModal();
  });
}
