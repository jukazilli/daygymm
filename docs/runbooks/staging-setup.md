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

O frontend de staging está disponível em
<https://daygym-web-staging.pages.dev>. Cloudflare Pages foi adotado para o
staging e para o beta. A decisão não libera uso comercial: production,
capacidade, custos, domínio, segurança e rollback ainda passam por gate próprio,
mas Vercel não faz parte da topologia planejada.

Enquanto o limite de projetos do Google Cloud não é ampliado, os recursos acima
usam temporariamente o projeto host `pex-gsc`. Eles são separados por nomes,
service accounts, Workload Identity Pool, secrets, bucket, registry e rótulos
`application=daygym` e `environment=staging`. Nenhum recurso existente no host
é administrado pelo Terraform do DayGym.

## Fluxo

1. Desenvolva em uma branch local criada a partir de `main` e execute os gates
   locais antes de publicar o candidato.
2. Avance `staging` por fast-forward até o SHA candidato exato. Force push não
   faz parte do fluxo.
3. O GitHub Actions executa formato, lint, tipagem, testes, builds e
   verificações de segurança no SHA de `staging`.
4. O Cloudflare Pages publica esse SHA no projeto de staging e registra o
   resultado como check do commit.
5. O pipeline aplica somente as migrations versionadas em
   `supabase/migrations` ao banco Supabase de staging.
6. Quando o sinalizador `DAYGYM_STAGING_DEPLOY_ENABLED` estiver ativo, o
   GitHub Actions autentica no Google Cloud por OIDC, constrói uma imagem
   imutável no Cloud Build e publica a mesma imagem na API e no worker.
7. O pipeline confirma `/health/live` e `/health/ready` da API e confirma que
   o worker não aceita uma chamada anônima externa.
8. Somente depois de todos os gates hospedados, abra um PR de `staging` para
   `main` e promova com merge commit. Rebase e squash não preservam a
   ancestralidade do SHA validado.
9. Se `staging` não puder avançar por fast-forward, interrompa a promoção e
   reconcilie o histórico por PR; nunca reescreva a branch de ambiente.

O Cloudflare pode registrar um check adicional ao abrir o PR com um SHA já
publicado. O gate da web é o deployment de produção do projeto disparado pela
branch `staging`; um preview duplicado não substitui nem invalida essa prova.

## Governança do repositório

- O repositório público contém somente a fundação revisável. Documentos
  canônicos e backlog de produto permanecem fora do Git e não devem ser
  reproduzidos em Issues públicas.
- `main` exige pull request e o check `Quality gates`, bloqueia force push e
  exclusão e exige que a branch esteja atualizada antes da promoção.
- A proteção de histórico linear permanece desligada para permitir merge
  commits que preservem os SHAs já validados em `staging`.
- Exceções temporárias de fundador solo são registradas por PR em
  [governança da fundação M0](../governance/m0-foundation.md). Uma autorização
  não se estende silenciosamente a mudanças futuras.

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
- O backlog operacional aguarda uma fonte privada. Issues deste repositório não
  recebem regras, jornadas ou critérios de aceite restritos.
