# Governança da fundação M0

Status: aceita para o PR de fundação em 12 de agosto de 2026.

## Decisões do corte

### Repositório público com superfície mínima

O repositório permanece público somente para a fundação técnica. Documentos
canônicos de produto, UX, arquitetura e backlog continuam locais e ignorados
pelo Git. Issues públicas não substituem a fonte operacional privada ainda
pendente.

### Staging hospedado

Cloudflare Pages hospeda o frontend estático de staging. Cloud Run hospeda API
e worker a partir da mesma imagem imutável, e Supabase hospeda banco e
autenticação. Essa topologia é a decisão operacional do staging atual; o
hosting do beta comercial continua sujeito a gate próprio.

### Exceção temporária de fundador solo

O repositório possui um único colaborador. Por isso, o PR #1 não consegue obter
aprovação humana independente sem criar uma aprovação fictícia. O owner
autorizou uma exceção limitada a esse PR para promover a fundação já validada
em staging.

Controles compensatórios:

- pull request obrigatório para `main`;
- check `Quality gates` obrigatório e executado no último SHA;
- branch atualizada antes do merge;
- force push e exclusão de `main` bloqueados;
- deploy de staging comprovado separadamente;
- nenhum dado real, segredo ou documento restrito no repositório;
- merge automático desativado para este corte.

## Encerramento da exceção

A exceção termina com o merge do PR #1 e não vale automaticamente para novos
PRs. Antes de mudanças de produto, dados pessoais ou abertura do M1, o projeto
deve escolher uma destas saídas:

1. adicionar um revisor humano independente e exigir uma aprovação; ou
2. registrar nova decisão temporária, com escopo, risco, prazo e controles
   compensatórios próprios.

## Pendência operacional

GitHub Issues é público neste repositório e, portanto, não pode receber o
backlog canônico restrito. O M0 permanece aberto até que uma fonte operacional
privada seja definida e os demais gates de autenticação, observabilidade,
restauração, privacidade e operação sejam comprovados.
