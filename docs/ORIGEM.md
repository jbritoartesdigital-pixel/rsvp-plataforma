# Origem e isolamento

Referência consultada: `jbritoartesdigital-pixel/libri-rsvp`, commit `a39843ed909a0735ca35c1090a443345022941e3`.

Foram analisados o Worker, schema, migrations e o funcionamento público do RSVP. A nova implementação segue os conceitos de evento, lista/livre, responsável e membros adultos/crianças, mensagens, personalização e painel da cliente. A autenticação administrativa compartilhada e os destinos Cloudflare existentes não foram transportados para a plataforma comercial.

Esta é uma implementação comercial separada, com interface própria e schema novo. Em 5 de outubro de 2026 foi realizada uma rodada de paridade funcional com o RSVP original: traduções, campos opcionais, regras de lista, limites por composição, personalização avançada, mídias, textos públicos, calendário, ferramentas de convidados, JSON e permissões da cliente foram reimplementados no modelo multi-tenant comercial. A matriz detalhada está em `docs/PARIDADE_LIBRI.md`. Nenhuma migração de dados do RSVP de produção foi preparada ou executada.

A referência de conversa disponível continha o planejamento das telas e da ordem de construção, mas não arquivos de uma implementação comercial anterior. A paridade foi implementada sem reutilizar banco, bucket, secrets, domínio ou autenticação administrativa do Libri. As diferenças intencionais de segurança e arquitetura estão registradas na matriz de paridade.

Destino: `jbritoartesdigital-pixel/rsvp-plataforma`.

Os nomes comerciais reservados são `rsvp-plataforma`, `rsvp-plataforma-db` e `rsvp-plataforma-media`. A configuração não inclui o D1 ou o R2 usados pelo RSVP existente. Um guard antes do deploy rejeita o ID conhecido do D1 de produção e exige os nomes comerciais.

O repositório fonte foi somente baixado e lido. Não recebeu commits, mudanças de arquivos, workflow, secrets ou deploy.
