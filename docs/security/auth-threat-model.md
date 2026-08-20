# Threat model inicial — autenticação e fronteiras sistêmicas

Status do modelo: **aprovado para a fundação e o staging sintético em 13 de
agosto de 2026**. FND-026 está `Done`. Aprovar o modelo significa aceitar o
inventário, os controles esperados e as decisões sobre risco residual; não
significa declarar que todos os controles estão implementados. Cada risco alto
aberto continua bloqueando a funcionalidade ou o ambiente indicado.

## Escopo e condição de uso

O primeiro recorte cobre cadastro por e-mail e senha, declaração 18+, aceite
dos documentos obrigatórios, login, recuperação, persistência, renovação e
logout no web estático e no aplicativo mobile. A extensão sistêmica cobre as
fronteiras já materializadas de dados/RLS, API `/v1`, eventos, build/deploy,
worker privado e persistência mobile. Supabase Auth é o provedor de identidade;
`api.profiles` e `api.consents` guardam somente elegibilidade e evidência de
aceite.

O recorte autoriza apenas contas sintéticas em staging depois dos controles
marcados como bloqueantes. Não autoriza production, usuários externos ou dados
reais. OAuth, MFA de usuário, SSO e administração de contas ficam fora deste
slice.

## Fluxo e fronteiras de confiança

```text
Pessoa
  | senha, declaração 18+ e aceite
  v
Web no Cloudflare Pages ---------> Supabase Auth <-------- Mobile Expo
  | chave publicável                  | JWT/refresh            | chave publicável
  |                                   v                        | SecureStore
  +----------------------------> schema api <------------------+
                                  | RLS por auth.uid()
                                  +-> profiles
                                  +-> consents append-only

Supabase Auth ---- link de confirmação/recuperação ----> provedor de e-mail
       |
       +---- redirect exato ----> callback web ou deep link mobile
```

Fronteiras:

1. navegador ou aparelho, sob controle parcial da pessoa;
2. bundle público e configuração pública no Cloudflare Pages/EAS;
3. Supabase Auth e canal de e-mail;
4. Data API, grants e RLS do schema `api`;
5. CI e stores operacionais, que não podem receber senha ou token de usuário.

## Atores e ativos sistêmicos

| Classe         | Inclui                                                   | Regra de confiança                                                                               |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Pessoa usuária | titular da conta e, futuramente, aluno                   | Não é confiada para escolher `user_id`, papel, prêmio ou estado de servidor.                     |
| Profissional   | treinador/nutricionista convidado                        | Só recebe capacidade explícita enquanto o vínculo estiver ativo.                                 |
| Operação       | mantenedor, suporte e contas de deploy                   | Menor privilégio, MFA quando disponível e nenhuma credencial persistente fora do store aprovado. |
| Provider       | Supabase, Cloudflare, Google Cloud e integrações futuras | Toda entrada é não confiável até validar origem, contrato, limite e replay.                      |
| Adversário     | bot, usuário malicioso ou dependência/build comprometido | Pode controlar cliente, parâmetros, ordem/repetição e conteúdo importado.                        |

Ativos sistêmicos incluem identidade e sessão, dados de saúde e treino, autoria
de planos, vínculos profissionais, ledger/rewards, artefatos de build,
credenciais operacionais, eventos internos e telemetria. Logs, IDs técnicos e
metadados também são dados: só entram quando têm finalidade e allowlist.

```text
Web/Cloudflare ---- TLS ----> Supabase Auth/Data API <---- TLS ---- Mobile
       |                              |                              |
       +--------- TLS ----------> API /v1                            +-> SecureStore/SQLCipher
                                      |
                                      +---- evento validado ----> Worker privado

GitHub Actions -- OIDC curto --> Google Cloud -- imagem por SHA --> API/Worker
       |
       +---- build estático por SHA ----> Cloudflare Pages
```

Cada seta é uma trust boundary. O banco não confia no cliente, a API não
confia em JWT sem validação/autorização, o consumer não confia em evento sem
schema/versão e o deploy não confia em artefato sem vínculo com o SHA aprovado.

## Ativos e invariantes

| Ativo                        | Invariante                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Senha e token de recuperação | Nunca chegam a banco da aplicação, log, analytics, suporte ou documentação.                                |
| Refresh/access token         | Só trafegam por TLS; refresh token usa rotação; nenhum token entra em URL, telemetry ou mensagem de erro.  |
| Identidade                   | O cliente não escolhe `user_id`; operações usam o sujeito autenticado e RLS.                               |
| Elegibilidade 18+            | Conta utilizável possui declaração positiva persistida; declaração ausente ou falsa falha fechada.         |
| Termos e Privacidade         | Aceites são separados, versionados e append-only; versão vazia ou desconhecida é rejeitada.                |
| Chave publicável             | Pode existir no bundle, mas nunca substitui Auth, grants ou RLS. Chave privilegiada é proibida no cliente. |
| Mensagens                    | Login, cadastro e recuperação não revelam se o e-mail existe.                                              |

## Decisões do recorte

1. Web e mobile usam o SDK Supabase diretamente com chave `sb_publishable_`.
   Cookie de sessão ou BFF exigem nova decisão arquitetural com proteção de
   origem/CSRF.
2. Redirects de confirmação e recuperação usam caminhos exatos. Wildcards de
   staging, domínio arbitrário e retorno recebido da query string são
   proibidos. O fluxo mobile usa scheme distinto por ambiente.
3. O cliente traduz erros do provedor para mensagens não enumeráveis e nunca
   mostra código, stack, e-mail cadastrado ou detalhe interno. O erro bruto é
   descartado, não enviado a analytics.
4. A declaração de maioridade é autodeclarada, mas não pode depender apenas da
   tela. A criação da evidência de perfil e dos dois aceites precisa falhar
   fechada e ser atômica antes de liberar qualquer dado de produto.
5. Logout local é explícito para o aparelho atual; "sair de todos os aparelhos"
   usa escopo global separado. O refresh token é revogado e o storage local é
   limpo, mas um access token já emitido pode permanecer válido até o limite de
   uma hora. Operação crítica futura deve revalidar estado corrente.
6. No web estático, a persistência acessível ao JavaScript mantém risco de roubo
   por XSS. O beta só aceita esse desenho com CSP restritiva, sem scripts de
   terceiros nas telas de conta, dependências auditadas e JWT de uma hora. No
   mobile, token persistente exige SecureStore; AsyncStorage é proibido.
7. Password reset não autentica automaticamente após a troca. A pessoa retorna
   ao login e pode revogar as demais sessões. A resposta ao pedido é sempre a
   mesma, exista ou não a conta.

## Ameaças, controles e risco residual

| ID      | Ameaça/cenário                                                                                                           | Controle obrigatório                                                                                                                                                                                                        | Teste ou evidência                                                                                                                  | Estado                                                                                                                                                                                                                          | Risco residual, owner e decisão                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01 | Enumeração por texto, status, tempo ou erro bruto no login/cadastro/recuperação.                                         | Copy genérica; contrato único de erro; resposta visual equivalente; detalhe do provedor não chega à UI/telemetria.                                                                                                          | Testes de componente e integração com conta existente/inexistente com mesma mensagem e forma de resposta.                           | Parcial: COR-004 foi aceita pelo owner e encerrada em 20/08/2026 após a prova hospedada repetir `consents` depois de `401` e chegar a `/hoje/` no primeiro clique, sem erro no console.                                         | **Médio — Security + Produto.** A conta externa continua bloqueada pelos critérios restantes de AUTH-01/FND-013; a recuperação temporal está aceita em staging. |
| AUTH-02 | Credential stuffing, criação automatizada e inundação de e-mail de confirmação/reset.                                    | Rate limits do Supabase; frequência mínima de 60 s por destinatário; cooldown de 80 s e `auth.resend` explícito; resposta 429 recuperável; Cloudflare Turnstile antes do beta externo; alerta por volume sem e-mail em log. | Integração prova limite/retry; E2E prova desafio quando acionado; configuração hospedada registrada sem segredo.                    | Parcial: Resend SMTP e limite hospedado foram ativados; COR-005 persiste apenas e-mail, prazo absoluto e incerteza de entrega por no máximo 80 s e passou na prova hospedada; aguarda aceite do owner. CAPTCHA e alerta faltam. | **Alto — Platform + Security.** Somente staging sintético sem CAPTCHA; beta externo bloqueado.                                                                  |
| AUTH-03 | Open redirect, phishing por callback ou deep link capturado por outro app.                                               | Allowlist exata por ambiente; PKCE; callback valida tipo/origem e remove fragmentos; nenhum `redirectTo` arbitrário.                                                                                                        | Testes negativos para host/caminho/scheme não permitidos e E2E dos callbacks web/mobile autorizados.                                | Implementado no web de staging: redirects exatos, `TokenHash` em fragmento e abertura no celular foram validados; o E2E do app nativo permanece em FND-013.                                                                     | **Médio — Platform.** Produção e app nativo continuam bloqueados até seus ambientes e callbacks próprios passarem pelo mesmo roteiro.                           |
| AUTH-04 | Roubo/replay de sessão por XSS, storage inseguro, dispositivo perdido ou refresh token copiado.                          | TLS; JWT de 1 h; refresh rotation/reuse de 10 s; CSP sem terceiros em auth; redaction; SecureStore mobile; logout local/global explícitos.                                                                                  | Testes verificam storage por plataforma, ausência de token em URL/log, renovação, expiração, logout local e global.                 | Parcial: web usa PKCE/renovação/logout; mobile tem adapter SecureStore, PKCE, lock e lifecycle com testes locais, mas falta device/E2E.                                                                                         | **Alto — Web/Mobile + Security.** Dados reais bloqueados até mobile, CSP e testes hospedados; o access token pode sobreviver ao logout até expirar.             |
| AUTH-05 | BOLA/IDOR lê ou grava perfil/aceite de outra pessoa.                                                                     | Grants mínimos; RLS `to authenticated`; `auth.uid()` comparado ao `user_id`; tabelas forçam RLS; aceite imutável.                                                                                                           | `identity_foundation.test.sql`: 41 verificações, incluindo tentativas cruzadas e `anon`; este padrão se repete em cada tabela nova. | Implementado e validado em staging.                                                                                                                                                                                             | **Baixo — Data.** Aceito para staging sintético; nova relação sem teste negativo bloqueia merge.                                                                |
| AUTH-06 | Menor declarado, aceite forjado ou falha entre criar Auth e persistir perfil/consentimentos deixa conta órfã/utilizável. | Declaração positiva e duas versões aprovadas; operação server-side atômica; todas as políticas de produto exigem conta elegível; `user_metadata` nunca concede papel.                                                       | SQL/integration rejeita falso, ausente, versão desconhecida e falha parcial; prova que conta incompleta não acessa produto.         | Parcial: trigger e verificações SQL passaram; inspeção hospedada encontrou zero identidades incompletas e o login não converte mais erro `503` em inconsistência.                                                               | **Alto — Produto + Privacy + Data.** Somente contas sintéticas; US-001 não fecha antes da aprovação jurídica e do teste hospedado.                              |
| AUTH-07 | Link de recuperação reutilizado, vazado, enviado em massa ou redirecionado para origem indevida.                         | Token gerado e validado pelo Supabase; redirect exato; mensagem genérica; limite/frequência; senha confirmada duas vezes; retorno ao login; opção de revogar todas as sessões.                                              | Integração/E2E cobre e-mail existente/inexistente, token inválido/expirado/reutilizado e troca seguida de login.                    | Parcial: entrega Resend, redirect exato e consumo cross-browser no celular foram aceitos; replay, revogação e o E2E nativo permanecem pendentes em FND-013.                                                                     | **Alto — Security + Platform.** Staging web aceito; produção e dados reais continuam bloqueados até os controles restantes passarem.                            |
| AUTH-08 | Chave privilegiada, senha ou token entra no bundle, commit, CI, log ou ferramenta de produto.                            | Apenas URL e chave publicável no cliente; scanner bloqueante; stores por ambiente; allowlist de telemetry sem payload de auth.                                                                                              | `check:client-environment`, `check:secrets`, inspeção do bundle e testes que falham se logger recebe campos proibidos.              | Parcial: variáveis públicas estão no bundle; SMTP ficou no store do Supabase; a chave usada na configuração foi rotacionada e a antiga foi revogada.                                                                            | **Alto — Platform.** Scanner e rotação passaram; produção continua bloqueada até gestão de segredo, substituto e resposta a incidente serem provados.           |

## Ameaças sistêmicas e decisão residual

| ID     | Ameaça/cenário                                                             | Controle e teste obrigatório                                                                                                                  | Estado observado                                                                                                                                                                  | Risco residual, owner e decisão                                                                                                                                               |
| ------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYS-01 | BOLA/IDOR em treino, plano, vínculo ou recurso futuro.                     | Ator resolvido no servidor; RLS deny-by-default; grant mínimo; teste negativo entre usuários/papéis em cada relação e rota.                   | Perfis/aceites e finalizações de sessão têm RLS e isolamento SQL; ainda não existe rota pública de treino.                                                                        | **Alto — Data + Backend.** A tabela de sessão é aceita somente em staging sintético; a futura rota precisa resolver o ator pelo JWT e repetir o teste cruzado.                |
| SYS-02 | Papel profissional, convite ou JWT antigo amplia acesso.                   | Papel autoritativo em `app_metadata`/servidor, vínculo ativo, expiração, revogação e revalidação em operação crítica.                         | Fronteira profissional ainda não foi implementada.                                                                                                                                | **Alto — Backend + Security.** Bloqueia toda capacidade profissional até o slice declarar vínculo, revogação e prova negativa.                                                |
| SYS-03 | Replay duplica finalização, publicação, Coin/reward ou efeito assíncrono.  | `Idempotency-Key`, unique de origem, ledger/outbox append-only e consumer idempotente; teste repete e reordena a mesma intenção.              | Finalização reaproveita o evento original; o handler grava recibo e efeito na mesma transação, aceita reordenação entre sessões e não arquiva falhas. DLQ/queue age ainda faltam. | **Alto — Backend + Data.** O comando e handler internos são aceitos em staging sintético; efeito econômico permanece bloqueado e FND-022 só fecha após retry/DLQ e queue age. |
| SYS-04 | Dependência, action ou imagem comprometida altera o artefato.              | Versões e actions por SHA, lockfile congelado, audit bloqueante, OIDC curto, imagem imutável e, antes do beta, SBOM/proveniência verificável. | Lock/actions/OIDC/imagem por SHA e auditoria high/critical estão ativos; SBOM/proveniência aguardam FND-019.                                                                      | **Médio — Platform + Security.** Staging sintético aceito; produção e dado real bloqueados até a prova de supply chain.                                                       |
| SYS-05 | XLSX hostil executa fórmula/macro ou esgota memória.                       | Parse como dado em sandbox, sem macro/fórmula ativa, limites de arquivo/linhas/células, timeout e validação server-side.                      | Importador ainda não foi implementado.                                                                                                                                            | **Alto — Web + Backend.** Importação permanece indisponível até testes com zip bomb, fórmula e células extremas.                                                              |
| SYS-06 | Webhook/provider falso, atrasado ou repetido altera oferta/job.            | Assinatura, timestamp, nonce, allowlist, limite, dedupe e payload por schema; testes de origem, expiração e replay.                           | Não há webhook ou integração mutável exposta neste corte.                                                                                                                         | **Alto — Integrations.** Cada provider reabre este modelo e fica desligado até sandbox e verificação de origem passarem.                                                      |
| SYS-07 | Telemetria ou erro registra saúde, conteúdo, token ou query sensível.      | Catálogo allowlist, minimização, scrubbing e teste de artefato/log; replay e IP sensíveis desligados por padrão.                              | API usa Problem Details e log allowlisted sem URL crua; analytics/Sentry ainda não foram conectados.                                                                              | **Alto — Platform + Privacy.** FND-020/FND-024 não podem enviar evento antes do catálogo e da inspeção negativa.                                                              |
| SYS-08 | Dispositivo perdido, backup do SO ou storage inseguro expõe sessão/treino. | Sessão no SecureStore/Keychain; banco SQLCipher com chave separada; lock, rotação, logout e testes em release/device/backup.                  | Implementação e 18 testes locais de storage/DB existem; EAS, aparelho e backup/restore permanecem sem prova.                                                                      | **Alto — Mobile + Security.** Somente dados sintéticos até FND-016/FND-017 provarem build e aparelho reais.                                                                   |

## Regra de reabertura

O modelo deve ser revisado no mesmo PR do slice quando surgir qualquer um dos
itens abaixo:

1. novo papel, tenant, dado sensível, tabela/RLS ou capacidade administrativa;
2. nova rota com escrita, idempotência, upload, redirect ou efeito econômico;
3. novo evento, consumer, fila, webhook ou provider externo;
4. nova persistência no cliente, permissão nativa, deep link ou variante mobile;
5. nova telemetria, script de terceiro, segredo, privilégio de CI ou ambiente;
6. mudança que invalide controle, teste, owner ou decisão residual desta matriz.

O PR referencia os IDs afetados, atualiza estado/evidência e não marca o risco
como reduzido apenas porque o código compila. Risco sem owner ou decisão bloqueia
o slice.

## Matriz mínima de verificação de FND-013/US-001

| Teste                           | Prova esperada                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| AUTH-T01 — cadastro elegível    | Adulto + versões aprovadas criam Auth, perfil e dois aceites sem estado parcial.                                         |
| AUTH-T02 — menor/aceite ausente | Requisição falha fechada e não cria conta utilizável.                                                                    |
| AUTH-T03 — não enumeração       | Casos existente/inexistente produzem a mesma copy pública em login, cadastro e reset.                                    |
| AUTH-T04 — abuso                | Repetição recebe limite, cooldown de 80 s e reenvio explícito; nenhuma mensagem confirma a existência da conta.          |
| AUTH-T05 — redirect             | Apenas callbacks exatos de cada ambiente são aceitos; host, path e scheme adulterados falham.                            |
| AUTH-T06 — sessão               | Renovação funciona; token não aparece em URL/log; mobile persiste somente no SecureStore.                                |
| AUTH-T07 — logout/revogação     | Logout local limpa o dispositivo; logout global invalida refresh tokens; JWT residual é tratado pelo limite documentado. |
| AUTH-T08 — recuperação          | Link válido troca senha uma vez, link inválido/expirado falha e a pessoa volta ao login.                                 |
| AUTH-T09 — isolamento           | Usuário A não lê nem grava perfil/consentimentos de B; `anon` não acessa.                                                |
| AUTH-T10 — bundle e telemetry   | Nenhuma chave privilegiada, senha, e-mail, token ou erro bruto aparece nos artefatos e eventos.                          |

## Pendências antes de fechar FND-013

1. Um owner autorizado precisa inserir a URL e a chave publicável diretamente
   no Cloudflare Pages/EAS e permitir a inspeção dos bundles (FND-018).
2. Produto/Privacy precisam substituir os documentos transparentemente
   identificados como teste pelas versões jurídicas aprovadas; a allowlist
   atual é exclusiva de staging sintético.
3. Platform precisa cadastrar callbacks exatos de staging/web/mobile e provar
   a configuração hospedada.
4. O slice mobile já implementa SecureStore, ciclo de renovação, gateway e telas
   de conta; development build, aparelho real e testes hospedados ainda precisam
   completar a matriz acima.

## Referências normativas e técnicas

- OWASP: [Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html), decomposição, identificação/priorização, mitigação e revisão.
- [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/tree/v5.0.0), áreas de
  autenticação, sessão, autorização e proteção de dados.
- OWASP: [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
  e [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
- Supabase: [Password-based Auth](https://supabase.com/docs/guides/auth/passwords),
  [User Sessions](https://supabase.com/docs/guides/auth/sessions),
  [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
  [Rate Limits](https://supabase.com/docs/guides/auth/rate-limits),
  [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha),
  [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks) e
  [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
