# Validação da entrega

Data: 5 de outubro de 2026. Ambiente: Node 24.19, SQLite do Node, Wrangler 4.147, Edge em modo headless e autenticador WebAuthn virtual.

## Resultados aprovados

- Sintaxe de todos os arquivos JavaScript e módulos de teste.
- 19 testes automatizados, incluindo schema íntegro e chaves estrangeiras compostas.
- Cadastro → checkout simulado → crédito → criação de evento → RSVP → QR → check-in.
- Cadastro → assinatura → fatura autorizada → pagamento aprovado → mensal → criação de múltiplos eventos.
- Notificações repetidas, pagamento duplicado da mesma ordem, estorno repetido e eventos fora de ordem.
- Consulta correta de `subscription_authorized_payment` em `/authorized_payments/{id}`, seguida do pagamento da fatura.
- Trocas mensal/créditos nos dois sentidos, cancelamento remoto e resistência a webhook de contrato antigo.
- Rejeição de evento sem saldo, com mensal pendente, vencido ou estornado; consumo de crédito simultâneo.
- QR invalidado por `no`, `pending`, alteração direta do membro e desativação do evento; reconfirmação gera outro QR; QR de outro evento rejeitado.
- Isolamento entre conviteiras, suspensão de conta e restrições da equipe.
- CSRF, assinatura adulterada, passkey inválida, desafio reutilizado e token de reset reutilizado rejeitados.
- Compilação do frontend e do Worker; empacotamento Cloudflare `deploy --dry-run` aprovado sem publicação.
- Navegador real local: cadastro, crédito simulado, evento, RSVP, geração de QR, check-in e cadastro/login com passkey virtual. Layout móvel sem transbordamento horizontal e sem erros de JavaScript.
- Inspeção visual das capturas desktop e móvel.
- Repositório fonte baixado permanece sem alterações locais.

## Limites do teste

O schema e as operações da aplicação foram executados em SQLite com adaptador da API D1, inclusive transações de `batch`, triggers e constraints. A tentativa adicional de aplicar as migrations pelo D1 local do Wrangler falhou ao iniciar o executável `workerd` no Windows, com erro nativo de acesso à memória/stack overflow. Nenhuma migration remota foi executada. Não foi instalado ou alterado componente do Windows para contornar esse erro.

Os pagamentos são fixtures da API Mercado Pago, não transações reais. A assinatura WebAuthn foi verificada com um autenticador virtual do navegador, não com Face ID ou digital de aparelho físico. A câmera, os uploads ao R2 real, o envio de e-mail e os recursos Cloudflare comerciais exigem homologação depois de configurados.

## Reproduzir

```sh
pnpm install --frozen-lockfile
pnpm run validate
pnpm exec wrangler deploy --dry-run
```

O teste opcional `tests/browser-smoke.mjs` precisa de Playwright disponível. `PLAYWRIGHT_MODULE` pode apontar para seu módulo ESM e `BROWSER_CHANNEL=msedge` permite usar o Edge instalado. O script serve somente a aplicação local com banco SQLite em memória e fixtures de pagamentos, encerra servidor/navegador e salva capturas fora da pasta de código.

`scripts/qa-local.mjs` também tenta a migration via D1 local; depende de um `workerd` funcional no sistema.
