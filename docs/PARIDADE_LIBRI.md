# Paridade funcional com o Libri RSVP

Referência somente leitura: `jbritoartesdigital-pixel/libri-rsvp` no commit `a39843ed909a0735ca35c1090a443345022941e3`.

Esta matriz registra o que foi reimplementado na plataforma comercial. “Adaptado” significa que a utilidade foi preservada, mas a implementação segue o modelo multi-tenant, as regras de segurança e o fluxo comercial do Presença Confirmada.

| Recurso do original | Estado comercial | Observação |
| --- | --- | --- |
| RSVP livre | Portado | Link público por marca/evento. |
| RSVP por lista | Adaptado | Usa link secreto por família; não expõe busca pública de nomes. |
| Lista estrita / flexível | Portado | Flexível permite acrescentar pessoas dentro dos limites. |
| Limite total por família | Portado | Validado no backend. |
| Limite de adultos e crianças | Portado | Vagas de adulto e criança são independentes. |
| Família/grupo + responsável | Portado | `group_label` separado do responsável. |
| Presença individual por membro | Portado | Adulto/criança e yes/no/pending por pessoa. |
| Distinção pré-cadastrado/adicionado | Portado | `is_preapproved` preservado. |
| Prazo de RSVP | Portado | Bloqueio no backend e tela pública de encerramento. |
| Campos opcionais | Portado | Telefone, restrição alimentar, observações e mensagem. |
| Mensagens dos convidados | Portado | Busca dedicada e respeito à permissão da cliente. |
| Busca/filtros de convidados | Portado | Status e duplicados no painel profissional e do cliente. |
| Possíveis duplicados | Portado | Normalização de nome, provável original e possível cópia. |
| Seleção em lote | Portado | Selecionar exibidos e enviar à lixeira. |
| Cadastro em massa por nomes | Portado | Um nome por linha, até 300 por operação. |
| Importação CSV | Portado | Formato novo e formato legado continuam aceitos. |
| Exportação CSV | Portado | Cabeçalhos em português e proteção contra fórmula. |
| Exportação PDF | Portado | Relatório branco para impressão/PDF com resumo, lista e mensagens. |
| Lixeira/restauração | Portado | Soft delete com restauração e QR revogado. |
| Histórico do evento | Portado | Auditoria indexada por evento e ator quando disponível. |
| Pausar/reativar | Portado | Pausa fecha o RSVP; mídia segue visível no painel. |
| Arquivar/restaurar evento | Portado | Visão separada de arquivados. |
| Duplicar evento | Adaptado | Copia configuração sem convidados e consome entitlement como novo evento. |
| Personalização de cores | Portado | Fundo, cartão, textos, botão e sobreposição. |
| Estilo do cartão | Portado | Soft, glass e solid. |
| Opacidade, blur e raio | Portado | Com prévia ao vivo. |
| Largura/tipografia | Portado | Narrow/medium/wide e estilos de fonte. |
| Posição da mídia | Portado | Horizontal e vertical. |
| Imagem de fundo | Portado | R2 comercial. |
| Vídeo de fundo | Portado | MP4/WebM, até 20 MB. |
| Capa e logo | Portado | Biblioteca de mídia do evento. |
| Biblioteca/remoção de mídia | Portado | Upload com progresso, uso e remoção. |
| Prévia de aparência | Portado | Preview ao vivo e aviso de alteração não salva. |
| Textos públicos personalizados | Portado | Inclui rótulos, botões, sucesso, recusa e prazo encerrado. |
| Português / English | Portado | Interface pública selecionável por evento. |
| Adicionar à agenda | Portado | Google Calendar e arquivo ICS. |
| Voltar ao convite | Portado | URL HTTP/HTTPS sanitizada. |
| Painel privado do cliente | Portado | Token opaco separado da conta da conviteira. |
| Permissões granulares da cliente | Portado | Convidados, aparência/mídia, textos, mensagens, exportação e dados. |
| Alterar permissões sem trocar link | Melhorado | Rotação do link é ação explícita separada. |
| JSON importar/exportar | Adaptado | Lê JSON legado do Libri e JSON v2 comercial. |
| Mídia em JSON | Adaptado | URLs antigas não são importadas; arquivos devem ser enviados ao R2 comercial. |
| Turnstile opcional | Portado | Script carregado somente em evento protegido. |
| Proteção de reenvio duplicado | Melhorado | `creation_request_id` idempotente no banco. |
| Validação de formulário/scroll para erro | Portado | Erro inline e foco no primeiro campo inválido. |
| Busca pública por nome na lista | **Não portada por segurança** | Evita enumeração pública de convidados. Lista usa link secreto por família. |
| Senha administrativa compartilhada | **Não portada** | Substituída por contas, papéis, sessões e passkeys. |
| Recursos Cloudflare do Libri | **Não portados** | D1/R2/Worker comerciais são isolados. |

## Recursos que existem apenas no comercial

Além da paridade acima, a plataforma comercial acrescenta multi-tenancy, créditos e mensalidade, checkout/webhooks Mercado Pago, Super Admin, equipe, impersonação auditada, recuperação de conta, passkeys, QR/check-in familiar ou individual, guardas de deploy, ambiente HML separado e validação sem deploy.

## Regra de isolamento

O repositório `libri-rsvp` foi consultado somente como referência. Nenhum commit, migration, secret, domínio, D1, R2 ou Worker desse projeto foi modificado ou reutilizado pela plataforma comercial.
