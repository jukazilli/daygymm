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
| Google Cloud                | OIDC federado, sem chave persistente no GitHub        | Service account e environment separados antes do beta real |

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
privilegiadas estão implementados. A URL pública de staging é conhecida, mas os
valores ainda não foram ativados no Cloudflare Pages/EAS porque a conta
operacional atual não possui permissão para consultar as API keys do projeto no
Supabase. FND-018 permanece `In Progress` até uma conta autorizada fornecer a
chave `sb_publishable_` diretamente aos stores dos provedores, sem copiá-la para
código, documentação, issue ou log.

Em 13 de agosto de 2026, uma inspeção funcional do staging confirmou que o
bundle publicado não contém nenhuma das três variáveis públicas web. O login
falha antes de emitir request ao Supabase, com mensagem de configuração segura.
Isso comprova o bloqueio sem expor valores: `NEXT_PUBLIC_DAYGYM_SITE_URL`,
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` precisam ser
definidas no ambiente de build do Cloudflare e uma nova publicação deve ser
inspecionada antes do teste hospedado de autenticação.

Os riscos e testes obrigatórios desse fluxo estão em
[`auth-threat-model.md`](./auth-threat-model.md). Ativar as variáveis não basta
para declarar autenticação pronta: callbacks, sessão, não enumeração e
isolamento também precisam das evidências previstas ali.
