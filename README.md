# DayGym

Aplicação de acompanhamento de treinos, evolução, nutrição e colaboração segura entre aluno e profissional.

## Estado do projeto

O produto está em **M0 — Fundação e Setup**. Este repositório contém apenas a fundação pública e segura: monorepo, shells, toolchain, Supabase de staging e CI.

Os documentos canônicos de produto, UX, engenharia e backlog são material restrito. Eles permanecem fora deste repositório público e devem ser consultados por pessoas autorizadas antes de iniciar qualquer item de produto.

> **Nome canônico:** DayGym. “DayGynn” aparece apenas em material histórico autorizado.

## Estrutura

- `apps/mobile`: shell Expo/React Native.
- `apps/web`: shell Next.js.
- `packages/domain`: limites puros do domínio, sem framework ou infraestrutura.
- `packages/contracts`: contratos públicos iniciais.
- `packages/design-tokens`: tokens compartilhados de tema claro e contrato de tema escuro.
- `supabase`: migrations versionadas para o ambiente de staging e seed seguro.
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

O desenvolvimento é validado online: commits passam pelo CI e migrations aprovadas são aplicadas somente pela branch `staging`. Consulte o [runbook de staging](docs/runbooks/staging-setup.md). Docker não é necessário.
