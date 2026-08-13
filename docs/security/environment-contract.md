# Contrato de ambientes e credenciais

Este documento registra nomes e superfícies. Valores nunca são documentados,
logados ou copiados para issues.

## Clientes

| Superfície | Origem/callback                              | URL pública do Supabase    | Chave publicável                       |
| ---------- | -------------------------------------------- | -------------------------- | -------------------------------------- |
| Web        | `NEXT_PUBLIC_DAYGYM_SITE_URL`                | `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Mobile     | Scheme e callback derivados de `APP_VARIANT` | `EXPO_PUBLIC_SUPABASE_URL` | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

| Variante mobile | Identificador de instalação     | Confirmação de conta          | Redefinição de senha                   |
| --------------- | ------------------------------- | ----------------------------- | -------------------------------------- |
| `development`   | `com.daygym.mobile.development` | `daygym-development://entrar` | `daygym-development://redefinir-senha` |
| `preview`       | `com.daygym.mobile.preview`     | `daygym-preview://entrar`     | `daygym-preview://redefinir-senha`     |
| `production`    | `com.daygym.mobile`             | `daygym://entrar`             | `daygym://redefinir-senha`             |

`NEXT_PUBLIC_DAYGYM_SITE_URL` aceita somente uma origem HTTPS exata, sem path,
query, fragmento ou credencial. O cliente deriva dela apenas os callbacks
fixos versionados; retorno arbitrário recebido por parâmetro é proibido.

Os clientes aceitam exclusivamente chaves com prefixo `sb_publishable_`.
Chaves `sb_secret_`, service role, conexão PostgreSQL, SMTP, OAuth e signing
nunca entram em código cliente, bundle, analytics ou log.

## Gestão por ambiente

| Classe                      | Staging                                               | Production                                                 |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| Configuração pública web    | Variáveis de build do Cloudflare Pages                | Projeto e domínio próprios antes do beta real              |
| Configuração pública mobile | Ambiente preview do EAS, isolado por perfil e channel | Ambiente production do EAS antes do beta real              |
| Banco/migrations            | Secret `SUPABASE_DB_URL_STAGING` no GitHub Actions    | Secret e approval próprios antes de dados reais            |
| Banco/worker                | `daygym-database-url` no Google Secret Manager        | Role e secret próprios, sem reutilizar migration/admin     |
| Google Cloud                | OIDC federado, sem chave persistente no GitHub        | Service account e environment separados antes do beta real |

O worker recebe somente o caminho `DAYGYM_DATABASE_URL_FILE`. O arquivo montado
usa a role PostgreSQL `daygym_worker_runtime`, connection limit 2 e wrappers
privados bounded. A URL nunca entra em variável pública, imagem, log ou output
de Terraform.

## Rotação e vazamento

1. Identificar a classe sem publicar o valor.
2. Revogar primeiro qualquer chave privilegiada e interromper o deployment
   afetado.
3. Substituir o valor no store do provedor e executar novamente os gates do
   mesmo ambiente.
4. Validar login, RLS, API/worker e ausência do valor antigo nos bundles e
   logs.
5. Registrar impacto, janela, owner e ação preventiva sem incluir credenciais.

A chave publicável também é rotacionada se houver abuso, mas sua exposição no
cliente é esperada; a segurança dos dados continua dependendo de Auth, grants e
RLS. O scanner `check:client-environment` bloqueia nomes ou prefixos
privilegiados nas aplicações.

## Estado da fundação Expo/EAS

Os manifests locais fixam Node `22.12.0`, EAS CLI `21.8.0`, runtime por
fingerprint e perfis explícitos `development`, `preview` e `production`. Cada
perfil seleciona seu próprio ambiente, channel, identificador de instalação e
deep link; a ausência de `APP_VARIANT` falha de forma segura em `development`.

O projeto remoto Expo/EAS, os ambientes hospedados e as credenciais de loja
ainda não foram criados neste corte porque a sessão operacional não está
autenticada no EAS. FND-016 permanece `In Progress` até um owner conectar o
project ID, definir recuperação das credenciais e provar ao menos os builds de
development e preview sem compartilhar valores com production.

## Estado do subcorte de autenticação

Os adapters, a validação tipada, os exemplos e o gate contra variáveis
privilegiadas estão implementados. Em 13 de agosto de 2026, um owner autenticado
ativou as três variáveis públicas web diretamente no ambiente Production do
projeto Cloudflare Pages de staging, sem persistir seus valores no repositório,
na documentação, em issues ou logs. A publicação `348310b9-709d-4232-a31e-d788f484220a`
foi concluída com sucesso.

A inspeção funcional posterior comprovou que o cliente passou a emitir o
request de cadastro ao Supabase e recebeu HTTP 200. O Supabase Auth usa Resend
por SMTP sobre TLS, com remetente no domínio verificado `soberania.tech`, limite
de 30 e-mails por hora e intervalo mínimo de 60 segundos por destinatário. A
credencial exposta durante a configuração foi substituída por uma chave restrita
a envio e revogada depois de um envio de recuperação entregue com a nova chave;
nenhum valor foi persistido no repositório ou nesta documentação.

O `Site URL` e as duas URLs exatas de confirmação e recuperação apontam para o
Cloudflare Pages. Um e-mail de recuperação foi entregue e seu destino foi
inspecionado sem consumir o token, confirmando `/redefinir-senha/`. A autenticação
por senha também retornou HTTP 200, mas a leitura de elegibilidade falhou com
`PGRST106` porque o schema `api` ainda não está exposto no Data API hospedado.
Exposição mínima do schema, persistência da sessão, logout e consumo completo do
link ainda precisam das evidências previstas para fechar FND-018. O ambiente
mobile EAS continua separado e não recebeu essas variáveis.

Os riscos e testes obrigatórios desse fluxo estão em
[`auth-threat-model.md`](./auth-threat-model.md). Ativar as variáveis não basta
para declarar autenticação pronta: callbacks, sessão, não enumeração e
isolamento também precisam das evidências previstas ali.
