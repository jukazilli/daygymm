# DayGym

Aplicação de acompanhamento de treinos, evolução, nutrição e colaboração segura
entre aluno e profissional.

## Estado do projeto

O produto está em **M0 — Fundação e Setup**. Este repositório contém somente a
fundação pública e segura: monorepo, shells, toolchain, Supabase de staging e
CI.

Os documentos canônicos de produto, UX, engenharia e backlog são material
restrito. Eles permanecem fora deste repositório público e devem ser
consultados por pessoas autorizadas antes de iniciar qualquer item de produto.

> **Nome canônico:** DayGym. “DayGynn” aparece apenas em material histórico
> autorizado.

## Estrutura

- `apps/api`: fronteira mínima de API e worker para o ambiente hospedado.
- `apps/mobile`: shell Expo/React Native.
- `apps/web`: shell Next.js estático, publicado no Cloudflare Pages.
- `packages/domain`: limites puros do domínio, sem framework ou infraestrutura.
- `packages/contracts`: contratos públicos iniciais.
- `packages/design-tokens`: tokens compartilhados de tema claro e contrato de
  tema escuro.
- `supabase`: migrations versionadas para o ambiente de staging e seed seguro.
- `infra/terraform`: fundação isolada do DayGym no host temporário do Google
  Cloud.
- `tooling`: verificações de fronteira e padrões de segredo.

## Comandos

```powershell
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

O desenvolvimento é validado online: commits passam pelo CI, migrations
aprovadas são aplicadas somente pela branch `staging` e a aplicação será
publicada no staging hospedado. Docker Desktop não é necessário; o container é
criado pelo Cloud Build.

Consulte o [runbook de staging](docs/runbooks/staging-setup.md).
