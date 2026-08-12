# Staging hospedado do DayGym

## Topologia

| Camada               | Serviço                 | Isolamento                                        |
| -------------------- | ----------------------- | ------------------------------------------------- |
| Web                  | Cloudflare Pages        | Projeto `daygym-web-staging`, conectado ao GitHub |
| API                  | Cloud Run               | Serviço público `daygym-api-staging`              |
| Worker               | Cloud Run               | Serviço interno `daygym-worker-staging`           |
| Imagens              | Artifact Registry       | Repositório `daygym-containers`                   |
| Banco e autenticação | Supabase                | Projeto DayGym de staging                         |
| Infraestrutura       | Terraform + GitHub OIDC | State e identidades próprios do DayGym            |

Enquanto o limite de projetos do Google Cloud não é ampliado, os recursos acima
usam temporariamente o projeto host `pex-gsc`. Eles são separados por nomes,
service accounts, Workload Identity Pool, secrets, bucket, registry e rótulos
`application=daygym` e `environment=staging`. Nenhum recurso existente no host
é administrado pelo Terraform do DayGym.

## Fluxo

1. Desenvolva em uma branch de trabalho e abra um PR.
2. O GitHub Actions executa formato, lint, tipagem, testes, builds e
   verificações de segurança.
3. O Cloudflare Pages publica uma prévia da interface estática para cada PR.
4. Depois da revisão, faça merge ou envie o corte aprovado para a branch
   `staging`.
5. O GitHub Actions aplica somente as migrations versionadas em
   `supabase/migrations` ao banco Supabase de staging.
6. Quando o sinalizador `DAYGYM_STAGING_DEPLOY_ENABLED` estiver ativo, o
   GitHub Actions autentica no Google Cloud por OIDC, constrói uma imagem
   imutável no Cloud Build e publica a mesma imagem na API e no worker.
7. O pipeline confirma `/health/live` e `/health/ready` da API e confirma que
   o worker não aceita uma chamada anônima externa.

## Operação de banco

O comando de deploy é:

```powershell
pnpm db:deploy:staging
```

Ele aplica as migrations pendentes e lista o histórico remoto. Não há reset,
seed de dados reais, Docker ou acesso a projetos fora do staging.

## Segredos

- `SUPABASE_DB_URL_STAGING` é um Secret do GitHub e pode existir em um `.env`
  local ignorado apenas para executar uma migration manual autorizada.
- URLs de banco e secrets de serviço entram no Secret Manager por fluxo seguro;
  nunca entram em commits, variáveis públicas, outputs do Terraform ou logs.
- Chaves públicas de cliente só serão configuradas quando a integração do app
  com Supabase for implementada.

## Custos

O Terraform cria um alerta mensal de R$ 50 para recursos do DayGym rotulados no
projeto host, com avisos em 50%, 80% e 100%. É um alerta, não um bloqueio
automático de gasto. O Cloud Run começa com zero instâncias mínimas e máximo de
uma instância por serviço.

## Aplicação inicial da infraestrutura

1. Crie o bucket de state uma única vez:

   ```powershell
   ./scripts/bootstrap/create-terraform-state.ps1 `
     -ProjectId pex-gsc `
     -BucketName daygym-tfstate-staging-101192507609
   ```

2. Em `infra/terraform/staging`, forneça o ID da conta de faturamento somente
   na sessão atual:

   ```powershell
   $env:TF_VAR_billing_account_id = "<id-da-conta-de-faturamento>"
   ```

3. Inicialize e revise o plano. A primeira aplicação mantém
   `provision_cloud_run = false`, criando somente a fundação.
4. Crie a primeira imagem imutável no Cloud Build.
5. Aplique novamente com `provision_cloud_run = true` e a tag da imagem
   validada.
6. Cadastre `DAYGYM_STAGING_DEPLOY_ENABLED=true` como variável do repositório
   GitHub depois que API, worker e OIDC forem verificados.

## Limites atuais

- O schema `api` é o único exposto e começa sem grants para `anon` ou
  `authenticated`.
- Cada relação futura em schema exposto exige RLS, grants mínimos e teste
  negativo correspondente.
- O seed permanece vazio: o staging não recebe contas, dados de saúde ou
  registros de produção.
