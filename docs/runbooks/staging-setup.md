# Staging do DayGym

## Fluxo

O DayGym usa infraestrutura hospedada. Docker Desktop e o stack Supabase local não fazem parte do fluxo.

1. Desenvolva em uma branch de trabalho e abra um PR.
2. O GitHub Actions executa formato, lint, tipagem, testes, builds e verificações de segurança.
3. Depois da revisão, faça merge ou envie o corte aprovado para a branch `staging`.
4. O GitHub Actions aplica somente as migrations versionadas em `supabase/migrations` ao banco Supabase de staging.
5. Teste a versão hospedada antes de promover qualquer mudança além do staging.

## Segredos

- `SUPABASE_DB_URL_STAGING` é um Secret do GitHub e pode existir em um `.env` local ignorado apenas para executar uma migration manual autorizada.
- Nunca use uma URL de banco, password, `service_role` ou secret em `NEXT_PUBLIC_`, `EXPO_PUBLIC_`, commits ou logs.
- As chaves públicas do cliente serão adicionadas somente quando a integração do app com Supabase for implementada.

## Operação de banco

O único comando de deploy é:

```powershell
pnpm db:deploy:staging
```

Ele aplica as migrations pendentes e lista o histórico remoto. Não há reset, seed de dados reais, Docker ou acesso a projetos fora do staging.

## Limites atuais

- O schema `api` é o único exposto e começa sem grants para `anon` ou `authenticated`.
- Cada relação futura em schema exposto exige RLS, grants mínimos e teste negativo correspondente.
- O seed permanece vazio: o staging não recebe contas, dados de saúde ou registros de produção.
