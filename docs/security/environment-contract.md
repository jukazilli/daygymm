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

O projeto remoto `@soberania-tech/daygym` está vinculado pelo ID público
`5875a3a9-584b-4987-8086-cf110fbbf168`. O painel usa o mesmo PNG 1024 × 1024
versionado em `apps/mobile/assets/icon.png`. Os ambientes `development` e
`preview` contêm somente `EXPO_PUBLIC_SUPABASE_URL` e
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, obtidas da configuração pública já
publicada em staging; `production` permanece sem variáveis. Nenhum valor foi
copiado para o repositório ou para logs.

FND-016 permanece `In Progress` até definir a recuperação das credenciais e
provar ao menos os builds de development e preview sem compartilhar valores com
production. O primeiro projeto remoto criado com slug `soberania` não está
vinculado ao aplicativo e deve ser removido somente após autorização explícita
do owner.

Em 20 de agosto de 2026, a inscrição individual no Apple Developer Program
ficou bloqueada na verificação de identidade: passaporte, CNH e CIN/RG válidos
retornaram `Invalid Submission` no app Apple Developer. O owner abriu chamado
com o Apple Developer Support para revisão ou validação manual. Até a resposta,
não existem certificado nem provisioning profile iOS; nenhuma credencial Apple
foi criada, compartilhada ou armazenada no EAS. Esse bloqueio externo impede o
build físico de iPhone, mas não invalida a configuração iOS versionada.

Para manter a prova nativa em andamento, o perfil `preview` fixa
`android.buildType=apk` e `distribution=internal`. O APK Android usa a variante
e o ambiente `preview`, é assinado por uma keystore gerenciada pelo EAS e pode
ser instalado diretamente, sem Google Play Console e sem servidor Metro. A URL
do artefato é acesso interno e não deve ser publicada. Produção continua sem
variáveis e sem build de loja.

O primeiro job Android expôs uma diferença entre o export local e o build EAS:
o bundle remoto começava antes que os pacotes TypeScript do workspace tivessem
gerado `dist`. O mobile agora possui `postinstall` explícito para compilar
`@daygym/contracts` e `@daygym/training-runtime` em instalações limpas. Os
pacotes Expo também seguem os patches esperados pelo SDK 55; `expo install
--check` é gate operacional antes de novos builds hospedados.

O build corretivo `ffbaec61-aeca-4fbb-a90b-292cb8f122a2`, associado ao commit
`71572f8814254453358d398664a7f879c3380eff`, terminou com sucesso no EAS em 20
de agosto de 2026 e produziu o APK interno de `preview`. A prova funcional em
Android físico continua pendente; o bloqueio externo da Apple e a prova em
iPhone permanecem abertos até a resposta do Apple Developer Support.

Em 21 de agosto de 2026, a distribuição Android pela Google Play foi adiada por
decisão financeira do owner: a taxa única de US$ 25 da conta Play Console não
será paga agora, com previsão de reavaliação em 3 de setembro de 2026. O bloqueio
é restrito ao cadastro do app, Play App Signing, upload de AAB, faixas de teste e
instalação pela Play Store. PWA, staging, EAS e instalação direta do APK
`preview` continuam autorizados. Antes de qualquer dependência real do Play
Console, o owner deve ser alertado e confirmar conta ativa e pagamento; nenhuma
contratação é implícita.

## Estado do subcorte de autenticação

### Continuidade de sessão

Web e mobile usam `persistSession: true` e `autoRefreshToken: true`. No mobile,
o refresh token permanece no SecureStore fragmentado e a renovação volta ao
primeiro plano junto com o app. O access token continua curto e rotativo por
segurança; a pessoa permanece autenticada entre reinícios até sair da conta,
revogar a sessão ou a plataforma invalidá-la por incidente/política. Token eterno
não faz parte do contrato.

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
inspecionado sem consumir o token, confirmando `/redefinir-senha/`. Em 13 de
agosto de 2026, o Data API hospedado foi alinhado ao contrato local: somente o
schema `api` está exposto, `api, extensions` compõem o extra search path, o limite
é de 100 linhas e `public` não recebe rota. A prova anônima recebeu `42501` em
`api` e `PGRST106` em `public`, confirmando schema reconhecido com grant negado e
superfície pública removida, respectivamente. Persistência da sessão, logout e
consumo completo do link ainda precisam das evidências previstas para fechar
FND-013. O ambiente mobile EAS continua separado e não recebeu essas variáveis.

Em 15 de agosto de 2026, uma nova recuperação respondeu `200`, foi entregue pelo
Resend e atualizou o envio no Auth, mas o link aberto em outro dispositivo não
forneceu TokenHash utilizável à rota intermediária. Os templates seguros estão
versionados no staging, porém ainda não foram aplicados ao Auth hospedado: o
workflow manual não está na branch padrão e o environment `staging` não contém o
`SUPABASE_ACCESS_TOKEN` necessário. Essa credencial deve permanecer no Supabase/
GitHub, nunca no Cloudflare ou no cliente. Até a sincronização e o E2E posterior,
confirmação e recuperação continuam abertas em COR-001.

Em 16 de agosto de 2026, um owner autenticado aplicou manualmente os dois
templates versionados no Auth hospedado, sem criar PAT. Após salvar e recarregar,
o template de confirmação manteve 2.520 caracteres e o de recuperação 2.574;
ambos contêm `TokenHash`, apontam para as rotas intermediárias exatas e não
contêm `ConfirmationURL`. O Resend permaneceu habilitado em `smtp.resend.com`,
com limite hospedado de 30 e-mails por hora e intervalo de 60 segundos por
destinatário. Uma nova recuperação respondeu `200`; COR-001 continua aberta
somente até o link novo ser consumido no celular e receber o aceite do owner.
Replay e revogação permanecem no escopo mais amplo de FND-013/AUTH-07.

O owner confirmou em 16 de agosto de 2026 que o novo fluxo funcionou no celular
e autorizou o fechamento de COR-001. Essa aceitação encerra o incidente do link
inválido em staging; replay, revogação de sessões e o E2E do app nativo continuam
como critérios mais amplos de FND-013 e AUTH-07.

Em 20 de agosto de 2026, a primeira tentativa de login foi reproduzida com rede
real: o grant de senha respondeu `200`, `consents` respondeu `200`, mas
`profiles` recebeu `401/PGRST303` com `JWT issued at future`. O segundo clique
funcionou. A conta tinha perfil, dois consentimentos e sessão renovável íntegros;
portanto, a causa não era credencial, identidade incompleta ou SMTP. COR-004
passa a tratar somente essa rejeição temporal antes que ela alcance as telas,
em web e mobile. Outros JWTs inválidos não recebem retry. O commit `4dd4140` foi
publicado em staging pelo run `32402356258`: no primeiro clique, o grant de senha
respondeu `200`, a primeira leitura de `consents` recebeu `401`, a repetição
automática recebeu `200` e a navegação chegou a `/hoje/` sem erro no console.
O owner aprovou a correção em 20 de agosto de 2026 e a issue #40 foi encerrada.

A mesma auditoria encontrou uma divergência em AUTH-02: o cooldown web usa
instante absoluto e corrige suspensão enquanto o processo permanece vivo, mas o
estado não sobrevivia ao encerramento do PWA. COR-005 agora persiste localmente
somente e-mail, prazo absoluto e incerteza de entrega, por no máximo 80 segundos.
Senha, token, consentimentos e respostas do provedor não são persistidos. O
estado é removido ao expirar, na confirmação concluída ou depois de um login
bem-sucedido; se o PWA estiver fechado no instante da expiração, a remoção física
ocorre na próxima abertura de uma tela de autenticação. O limite hospedado do
Supabase continua autoritativo. O commit `660d192` foi publicado em staging pelo
run `32413909771`; quality/security, banco, API/worker e health checks passaram,
e o Cloudflare Pages publicou o mesmo SHA no deployment `2db5f4ef`. Em navegador
isolado, o contexto sintético mínimo foi restaurado após reload com o contador
recalculado. A correção aguarda apenas o aceite do owner antes do fechamento de
COR-005.

Os riscos e testes obrigatórios desse fluxo estão em
[`auth-threat-model.md`](./auth-threat-model.md). Ativar as variáveis não basta
para declarar autenticação pronta: callbacks, sessão, não enumeração e
isolamento também precisam das evidências previstas ali.
