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

## Promoção entre staging e main

O SHA candidato passa primeiro pelos gates locais e depois avança `staging`
somente por fast-forward. O deploy hospedado valida banco, API, worker e web.
Somente então um PR de `staging` para `main` promove o mesmo histórico com merge
commit.

Rebase e squash não são usados nessa promoção porque trocam os SHAs já provados
em staging. A proteção de histórico linear fica desligada; force push e
exclusão das branches permanecem bloqueados.

O Cloudflare Pages usa a branch `staging` como origem do deployment principal.
Abrir o PR antes dessa publicação pode tentar reutilizar o mesmo SHA de um
preview e gerar um check duplicado sem atualizar o ambiente. Por isso, a prova
da web ocorre em `staging` antes da abertura do PR.

## Reprodutibilidade entre sistemas operacionais

O repositório normaliza arquivos de texto como LF por `.gitattributes`. Essa
regra evita que a configuração global `core.autocrlf=true` do Git no Windows
faça um clone limpo divergir do mesmo SHA validado pela CI Linux. O gate de
fundação exige instalação pelo lockfile e execução de `pnpm check:ci` e
`pnpm security` em clone remoto limpo.

### Exceção de reconciliação M0-GAP-001

O owner autorizou uma segunda exceção de fundador solo, limitada ao PR que
reconcilia os históricos criados pelo rebase do PR #1 e comprova o fluxo acima.
Os mesmos controles compensatórios permanecem obrigatórios. A exceção termina
com o merge desse PR, quando a proteção volta a exigir uma aprovação humana.

### Exceção de fechamento M0-GAP-001

Durante a prova do PR #2, o Cloudflare aceitou o preview do SHA e recusou
instantaneamente um segundo deployment do mesmo SHA em `staging`. O owner
autorizou a continuidade do corte para corrigir a ordem e promover o primeiro
SHA comprovado integralmente em staging. A exceção fica limitada ao PR dessa
correção e termina no merge.

## Pendência operacional

GitHub Issues é público neste repositório e, portanto, não pode receber o
backlog canônico restrito. O M0 permanece aberto até que uma fonte operacional
privada seja definida e os demais gates de autenticação, observabilidade,
restauração, privacidade e operação sejam comprovados.
