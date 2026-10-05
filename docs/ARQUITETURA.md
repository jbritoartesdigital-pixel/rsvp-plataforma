# Contratos principais

## Tenant

O tenant vem da sessão e do usuário, nunca de um `studio_id` enviado pelo navegador. Todo acesso autenticado a eventos consulta simultaneamente ID e `studio_id`. Filhos de eventos são consultados depois dessa autorização. A chave estrangeira composta associa mídia e membros ao evento correto.

O Super Admin só acessa a visão de uma conviteira por impersonação explícita, ligada à própria sessão e auditada. A senha da conviteira e sua sessão não são usadas para isso. Impersonação não concede privilégio de cobrança a `studio_user`.

## Billing

`credit_ledger` é imutável pela aplicação. O saldo é atualizado pelo trigger do ledger. A criação do evento testa a modalidade vigente e debita exatamente um crédito no mesmo INSERT, via triggers. Duas requisições concorrentes não conseguem gastar o mesmo crédito.

Créditos guardados não substituem uma mensalidade pendente. O mensal depende de `billing_mode='monthly'` e de `monthly_until` futuro. Ao trocar de modalidade, o entitlement mensal anterior é limpo e `billing_generation` avança. A cobrança recorrente antiga é cancelada no Mercado Pago antes da troca local. Falhas no cancelamento impedem a troca.

Cada assinatura e ordem é associada à geração vigente. Faturas antigas podem permanecer no histórico, mas só atualizam entitlement se assinatura, tenant, modalidade e geração coincidirem. Cancelamento e pausa pelo provedor revogam o entitlement e avançam a geração.

### Webhooks

O webhook valida HMAC, ID assinado igual ao corpo, request ID e timestamp. Os dados recebidos não são aceitos como confirmação de pagamento: o recurso é consultado na API do Mercado Pago.

- `payment`: consulta `/v1/payments/{id}`; verifica recebedor, BRL, valor e referência da ordem.
- `subscription_authorized_payment`: consulta `/authorized_payments/{id}`; consulta a assinatura em `/preapproval/{id}` e o pagamento indicado pela fatura em `/v1/payments/{payment.id}`. Uma assinatura autorizada sem fatura processada e pagamento aprovado não libera eventos.
- `subscription_preapproval`: atualiza o histórico e revoga entitlement em cancelamento/pausa.

Créditos são concedidos no máximo uma vez por ordem. A ordem registra qual pagamento efetivamente concedeu os créditos, para que um pagamento duplicado estornado não retire os créditos de outro pagamento. O estorno é compensado por outro lançamento único e pode produzir saldo negativo se créditos já foram consumidos; novos eventos ficam bloqueados até recompor saldo. Eventos existentes continuam disponíveis.

Mensalidade paga vence um mês de calendário após a data de débito da fatura, com carência configurável de 0 a 7 dias. O padrão é zero. Repetir a notificação não acrescenta um mês à data atual. Entitlement é calculado a partir das faturas aprovadas do contrato atual, nunca apenas do status `authorized` da assinatura.

Histórico financeiro persiste mesmo quando uma fatura não pode conceder acesso. Respostas bem-sucedidas só são devolvidas após gravação. Erros do provedor ou do banco não são marcados como concluídos: o Mercado Pago pode reenviar a notificação.

## RSVP e QR

O modo lista exige um convite individual com token opaco. Não há busca pública que enumere nomes ou aceite um ID de convidado como autorização. No modo livre, o primeiro envio cria o token para alterações posteriores. A resposta entrega um link para guardar.

QR é opcional por evento, familiar ou individual. `no` e `pending` revogam o token no banco, inclusive em alterações diretas no SQL. Mudança de modalidade de check-in ou desativação do evento também revoga os tokens. Reconfirmar emite outro token, sem restaurar o revogado.

O check-in consulta presença atual, status do evento e tenant. O INSERT revalida esses estados para evitar usar uma consulta anterior a um cancelamento concorrente. Há unicidade por pessoa/família, para evitar entrada duplicada; o histórico é preservado após alterações de presença.

## Passkeys e recuperação

SimpleWebAuthn valida desafio de uso único, RP ID, origem e verificação de usuário. Chaves públicas e contadores ficam no D1; biometria permanece no dispositivo. A conta suporta várias passkeys e senha de recuperação. Alterar senha ou recuperá-la revoga todas as sessões.

Recuperação por e-mail usa um serviço de envio HTTPS configurado pelo operador, com contrato `{to,subject,text}` e token Bearer. Sem esse serviço, o Super Admin pode emitir um link de recuperação privado com validade de 30 minutos. Nenhuma credencial é enviada automaticamente a terceiros nesta entrega.

## Publicação

O workflow é `workflow_dispatch`, sem publicação em push. A ordem é instalar com lockfile → sintaxe/testes/build → conferir destino comercial → migrations D1 → deploy Worker/assets. Não inicia criação ou alteração de recursos de produção.
