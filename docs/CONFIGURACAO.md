# Configuração do ambiente comercial

## Recursos já preparados em 5 de outubro de 2026

- Conta Cloudflare: `89e909b38d8f7cfe1c1583e77a6df55f`.
- D1 criado: `rsvp-plataforma-db`, ID `0856c666-5e49-4728-b78c-f22cacf9436d`.
- R2 criado: `rsvp-plataforma-media`, classe Standard, acesso público direto desativado. O Worker servirá as mídias pelo binding.
- Domínio de produção preparado no código: `https://app.presencaconfirmada.com.br`.
- O Worker de produção ainda não foi publicado. A homologação já usa Worker, D1 e R2 próprios e será acessada por `https://hml.presencaconfirmada.com.br` quando o domínio estiver ativo e vinculado.

Não recrie esses recursos. A seção seguinte é referência para outro ambiente. Ainda faltam credenciais de publicação no GitHub e dados do Mercado Pago. O guard de deploy continua bloqueando publicação com configuração financeira incompleta.

## Recursos novos

Crie os recursos na conta Cloudflare destinada à plataforma:

```sh
pnpm exec wrangler d1 create rsvp-plataforma-db
pnpm exec wrangler r2 bucket create rsvp-plataforma-media
```

Em outro ambiente, copie somente o ID do D1 novo para `wrangler.jsonc`. Mantenha os nomes comerciais. O ambiente atual usa os domínios próprios `hml.presencaconfirmada.com.br` e `app.presencaconfirmada.com.br`. `APP_ORIGIN` deve conter a origem HTTPS sem barra final e `RP_ID` somente o hostname correspondente. Para mudar de domínio depois de cadastrar passkeys, planeje novo cadastro das credenciais no novo RP ID.

Preços confirmados: `CREDIT_1_CENTS=1490` (1 evento), `CREDIT_5_CENTS=6490` (5 eventos), `CREDIT_10_CENTS=10990` (10 eventos) e `MONTHLY_CENTS=2990` (mensal ilimitado). Configure `MP_COLLECTOR_ID` com o ID da conta Mercado Pago que recebe os pagamentos. `GRACE_DAYS` vai de 0 a 7.

## Secrets

No Worker comercial, configure:

```sh
pnpm exec wrangler secret put MP_ACCESS_TOKEN
pnpm exec wrangler secret put MP_WEBHOOK_SECRET
```

### Turnstile opcional

O RSVP público suporta Cloudflare Turnstile por evento/ambiente. Quando quiser ativar, configure `TURNSTILE_SITEKEY` como variável não secreta do Worker e salve `TURNSTILE_SECRET` como secret:

```sh
pnpm exec wrangler secret put TURNSTILE_SECRET
```

Sem `TURNSTILE_SECRET`, nenhuma confirmação exige o desafio. O navegador só carrega o script do Turnstile quando o evento recebe uma `TURNSTILE_SITEKEY`. Nunca coloque `TURNSTILE_SECRET` no `wrangler.jsonc`.

Para recuperação automática por e-mail, acrescente `MAILER_URL` e `MAILER_TOKEN`. Use um serviço HTTPS que aceite POST JSON `{to,subject,text}` e autorização Bearer. Os dados de acesso não devem aparecer no repositório.

Antes de publicar, a Action **Validar plataforma sem publicar** pode ser executada manualmente. Ela roda sintaxe, testes, build, migrations D1 locais e `wrangler deploy --dry-run`, sem secrets e sem tocar em recursos remotos.

No GitHub, crie o environment `commercial` e os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. O token precisa de acesso ao Worker, D1 e R2 comerciais. Depois de preencher a configuração, faça commit e execute manualmente **Publicar plataforma comercial** na aba Actions. As migrations rodam antes do Worker. Um erro de teste ou migration interrompe o deploy.

## Primeiro Super Admin

Após aplicar a migration, use `scripts/bootstrap-admin.mjs` para gerar SQL com o hash da senha. O script lê `BOOTSTRAP_PASSWORD` do ambiente; não coloque a senha na linha de comando nem no Git. Exemplo em PowerShell:

```powershell
$senhaAdmin = Read-Host 'Senha inicial (mínimo 8 caracteres)' -AsSecureString
$env:BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $senhaAdmin).Password
node scripts/bootstrap-admin.mjs 'SEU_EMAIL' 'SEU_NOME' | Set-Content -Encoding utf8 bootstrap-admin.sql
Remove-Item Env:BOOTSTRAP_PASSWORD
pnpm exec wrangler d1 execute DB --remote --file bootstrap-admin.sql
Remove-Item -LiteralPath bootstrap-admin.sql
```

O primeiro admin não tem tenant próprio; abra `/admin` e selecione a conviteira por “Acessar”. As conviteiras criam sua própria conta em `/app/cadastro`. Crie inicialmente uma conta de teste e ajuste créditos no Admin para testar eventos sem pagamento.

## Mercado Pago

Use primeiro as credenciais de teste em um Worker comercial de homologação com D1/R2 próprios. Configure o callback HTTPS `/api/webhooks/mercadopago` para pagamentos e planos/assinaturas. O checkout também envia `notification_url`.

Confirme na homologação os cabeçalhos de assinatura e o timestamp entregues para cada tipo de webhook na aplicação Mercado Pago. Este código exige HMAC válido e timestamp dentro de 10 minutos; não há modo de aceitar assinatura ausente. Teste entrega, reentrega, pagamento rejeitado/pendente, aprovação, estorno, assinatura cancelada e falha de consulta do provedor. Um retorno de checkout no navegador nunca concede crédito.

### Pendências para abertura ao público

Identificação e suporte da operadora; termos e privacidade definitivos; política de retenção/exclusão; homologação com Mercado Pago e aparelhos reais; backup e monitoração dos recursos comerciais. O checkout não oferece estorno iniciado no próprio painel nesta versão: o estorno realizado no Mercado Pago é recebido e compensado no ledger.
