# Configuração do ambiente comercial

## Recursos já preparados em 5 de outubro de 2026

- Conta Cloudflare: `89e909b38d8f7cfe1c1583e77a6df55f`.
- D1 criado: `rsvp-plataforma-db`, ID `0856c666-5e49-4728-b78c-f22cacf9436d`.
- R2 criado: `rsvp-plataforma-media`, classe Standard, acesso público direto desativado. O Worker servirá as mídias pelo binding.
- Endereço inicial configurado: `https://rsvp-plataforma.jbrito-artesdigital.workers.dev`.
- Worker ainda não publicado: será criado no primeiro deploy manual pelo GitHub Actions, após as migrations. O D1 está vazio; o R2 está vazio.

Não recrie esses recursos. A seção seguinte é referência para outro ambiente. Ainda faltam credenciais de publicação no GitHub, preços dos créditos e dados do Mercado Pago. O guard de deploy continua bloqueando publicação com configuração financeira incompleta.

## Recursos novos

Crie os recursos na conta Cloudflare destinada à plataforma:

```sh
pnpm exec wrangler d1 create rsvp-plataforma-db
pnpm exec wrangler r2 bucket create rsvp-plataforma-media
```

Em outro ambiente, copie somente o ID do D1 novo para `wrangler.jsonc`. Mantenha os nomes comerciais. O ambiente atual já usa o endereço inicial `workers.dev`; se escolher domínio próprio, configure `vars.APP_ORIGIN` com a origem HTTPS sem barra final e `RP_ID` só com o hostname. Para mudar de domínio depois de cadastrar passkeys, planeje novo cadastro das credenciais no novo RP ID.

Defina os preços inteiros em centavos em `CREDIT_1_CENTS`, `CREDIT_5_CENTS` e `CREDIT_10_CENTS`. `MONTHLY_CENTS=2990`. Configure `MP_COLLECTOR_ID` com o ID da conta Mercado Pago que recebe os pagamentos. `GRACE_DAYS` vai de 0 a 7.

## Secrets

No Worker comercial, configure:

```sh
pnpm exec wrangler secret put MP_ACCESS_TOKEN
pnpm exec wrangler secret put MP_WEBHOOK_SECRET
```

Para recuperação automática por e-mail, acrescente `MAILER_URL` e `MAILER_TOKEN`. Use um serviço HTTPS que aceite POST JSON `{to,subject,text}` e autorização Bearer. Os dados de acesso não devem aparecer no repositório.

No GitHub, crie o environment `commercial` e os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. O token precisa de acesso ao Worker, D1 e R2 comerciais. Depois de preencher a configuração, faça commit e execute manualmente **Publicar plataforma comercial** na aba Actions. As migrations rodam antes do Worker. Um erro de teste ou migration interrompe o deploy.

## Primeiro Super Admin

Após aplicar a migration, use `scripts/bootstrap-admin.mjs` para gerar SQL com o hash da senha. O script lê `BOOTSTRAP_PASSWORD` do ambiente; não coloque a senha na linha de comando nem no Git. Exemplo em PowerShell:

```powershell
$senhaAdmin = Read-Host 'Senha inicial (mínimo 12 caracteres)' -AsSecureString
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

Preços de créditos; identificação e suporte da operadora; termos e privacidade definitivos; política de retenção/exclusão; homologação com Mercado Pago e aparelhos reais; backup e monitoração dos recursos comerciais. O checkout não oferece estorno iniciado no próprio painel nesta versão: o estorno realizado no Mercado Pago é recebido e compensado no ledger.
