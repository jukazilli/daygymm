# Setup local do DayGym

## Pré-requisitos

- Node.js `22.12.0` e Corepack.
- pnpm `9.11.0` (ativado pelo Corepack).
- Docker Desktop em execução para iniciar o Supabase local.
- Nenhum projeto Supabase, Vercel ou Expo remoto é criado por este procedimento.

## Bootstrap

1. Copie `.env.example` para o arquivo local apropriado apenas quando houver valores públicos autorizados. Não adicione chaves privilegiadas a clientes ou ao Git.
2. Execute `pnpm install --frozen-lockfile`.
3. Execute `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.

## Supabase local

1. Inicie o Docker Desktop e confirme que o daemon está disponível.
2. Execute `pnpm supabase:start`.
3. Execute `pnpm db:reset` para aplicar migrations e o seed seguro.
4. Execute `pnpm db:verify` para conferir a lista local de migrations.
5. Ao finalizar, execute `pnpm supabase:stop`.

O schema `api` é o único exposto localmente e começa sem grants para `anon` ou `authenticated`. Cada relação adicionada depois deve ter RLS, grants mínimos e teste negativo correspondente.

## Limites atuais

- Não há project ref, chave ou segredo remoto neste repositório.
- Staging, production, Vercel Preview, EAS e branch protection dependem de owners autorizados e permanecem fora deste bootstrap local.
- O seed não cria contas, dados de saúde ou registros semelhantes à produção.
