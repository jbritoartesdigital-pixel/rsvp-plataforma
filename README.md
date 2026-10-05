# RSVP Plataforma

Plataforma comercial separada para conviteiras, em Cloudflare Worker + D1 + R2. Cada conviteira tem sua marca, equipe, eventos e financeiro. Os links públicos usam `/{studio}/{evento}`.

## Incluído

- Cadastro, senha, sessões revogáveis, recuperação por link e passkeys com verificação criptográfica de origem, desafio e usuário.
- Papéis `super_admin`, `studio_owner`, `studio_user`; consultas de eventos sempre limitadas ao tenant da sessão.
- Landing, planos, painel da conviteira, eventos ativos/arquivados, famílias, lixeira/restauração, filtros e duplicados, inclusão em lote, CSV/PDF, mensagens, JSON compatível com o Libri original, personalização avançada, mídia R2 e painel privado do cliente.
- Crédito por evento, mensal de R$ 29,90, histórico, checkout Mercado Pago, processamento idempotente de pagamentos e estornos.
- Lista livre ou fechada, modo estrito/flexível, limites totais e por adulto/criança, campos opcionais, textos PT/EN, agenda Google/ICS, link de retorno ao convite e Turnstile opcional.
- Check-in opcional familiar ou individual, QR local, leitura por câmera em navegadores compatíveis, busca manual e histórico.
- Administração de conviteiras, suspensão, ajustes auditados de créditos, impersonação por sessão e consulta global de financeiro/eventos/auditoria.
- Validação manual sem deploy e publicação exclusivamente manual por GitHub Actions, com testes e migrations antes do deploy.

## Começar localmente

Node 24 e pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm run validate
pnpm run db:migrate:local
pnpm run dev
```

Para autenticação local, configure `.dev.vars` (ignorado pelo Git) com `APP_ORIGIN=http://localhost:8787` e `RP_ID=localhost`. Abra exatamente esse endereço. O navegador deve tratar localhost como contexto seguro para passkeys.

## Publicar no ambiente comercial

Siga [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md). O D1 e o R2 comerciais já foram criados e estão registrados em `wrangler.jsonc`, com domínio de produção preparado em `app.presencaconfirmada.com.br`; a homologação usa recursos próprios e `hml.presencaconfirmada.com.br`. Preços configurados: 1 evento por R$ 14,90; 5 eventos por R$ 64,90; 10 eventos por R$ 109,90; mensal ilimitado por R$ 29,90/mês.

Nenhum deploy ou pagamento real foi executado nesta entrega. Os testes financeiros usam respostas simuladas da API. A operação com credenciais de teste do Mercado Pago e as passkeys nos aparelhos reais devem ser homologadas no domínio comercial.

## Correções e validação

As regras e os testes estão descritos em [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e [docs/VALIDACAO.md](docs/VALIDACAO.md). A origem e o que foi aproveitado da referência estão registrados em [docs/ORIGEM.md](docs/ORIGEM.md).

Os termos e a privacidade exibidos no site são minutas de configuração. Complete a identificação da operadora, contato de suporte, retenção de dados e condições comerciais antes de oferecer o serviço ao público.
