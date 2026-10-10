import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeDiagnosticRoute, recordAdminApiFailure} from '../public/admin-diagnostics.js';
test('rotas técnicas removem tokens, CPF, identificação de clientes e parâmetros',()=>{
 const path='/api/admin/studios/cliente-CPF12345678901/payments/abc-token?token=segredo&cpf=123';
 const safe=safeDiagnosticRoute(path);
 assert.equal(safe,'/api/admin/studios/:id/payments/:id');
 assert.doesNotMatch(safe,/cliente|CPF|segredo|123|abc-token/);
 assert.equal(safeDiagnosticRoute('https://malicioso.example.com/api/admin/steal'),'(rota externa)');
});
test('diagnóstico é acionado somente após autenticação admin, e não reescreve fetch global',()=>{
 const source=readFileSync('public/app.js','utf8');
 const diagnostic=readFileSync('public/admin-diagnostics.js','utf8');
 const html=readFileSync('public/index.html','utf8');
 assert.match(source,/if\(pureAdmin && \(path==='\/admin'\|\|path==='\/admin\/conta'\)\)initAdminDiagnostics\(\)/);
 assert.doesNotMatch(diagnostic,/window\.fetch\s*=/);
 assert.match(diagnostic,/navigator\.share/);
 assert.match(diagnostic,/Enviar ao ChatGPT/);
 assert.match(diagnostic,/header\.append\(button\)/);
 assert.doesNotMatch(html,/admin-diagnostics\.js/);
 assert.doesNotMatch(diagnostic,/localStorage/);
});
