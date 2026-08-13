# Threat model de autenticação

Status do recorte: controles web e atomicidade server-side implementados
localmente em 13 de agosto de 2026. FND-026 permanece `In Progress` até a prova
hospedada, a configuração do Supabase e a fronteira mobile serem concluídas.

## Escopo e condição de uso

Este recorte cobre cadastro por e-mail e senha, declaração 18+, aceite dos
documentos obrigatórios, login, recuperação, persistência, renovação e logout
no web estático e no aplicativo mobile. Supabase Auth é o provedor de
identidade; `api.profiles` e `api.consents` guardam somente elegibilidade e
evidência de aceite.

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

| ID      | Ameaça/cenário                                                                                                           | Controle obrigatório                                                                                                                                                            | Teste ou evidência                                                                                                                  | Estado                                                                                                                                   | Risco residual, owner e decisão                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUTH-01 | Enumeração por texto, status, tempo ou erro bruto no login/cadastro/recuperação.                                         | Copy genérica; contrato único de erro; resposta visual equivalente; detalhe do provedor não chega à UI/telemetria.                                                              | Testes de componente e integração com conta existente/inexistente com mesma mensagem e forma de resposta.                           | Parcial: quatro testes web cobrem copy e resultados genéricos; integração hospedada aguarda configuração.                                | **Médio — Security + Produto.** Bloqueia conta externa até os testes hospedados passarem; aceita-se variação de latência do provedor somente em staging sintético. |
| AUTH-02 | Credential stuffing, criação automatizada e inundação de e-mail de confirmação/reset.                                    | Rate limits do Supabase; frequência mínima de 60 s por destinatário; resposta 429 recuperável; Cloudflare Turnstile antes do beta externo; alerta por volume sem e-mail em log. | Integração prova limite/retry; E2E prova desafio quando acionado; configuração hospedada registrada sem segredo.                    | Parcial: limites locais existem; CAPTCHA e configuração hospedada não foram validados.                                                   | **Alto — Platform + Security.** Somente staging sintético sem CAPTCHA; beta externo bloqueado.                                                                     |
| AUTH-03 | Open redirect, phishing por callback ou deep link capturado por outro app.                                               | Allowlist exata por ambiente; PKCE; callback valida tipo/origem e remove fragmentos; nenhum `redirectTo` arbitrário.                                                            | Testes negativos para host/caminho/scheme não permitidos e E2E dos callbacks web/mobile autorizados.                                | Bloqueado: o arquivo local só cobre localhost e o painel hospedado não foi validado.                                                     | **Alto — Platform.** Cadastro com confirmação e recuperação não podem ser declarados prontos até a allowlist hospedada passar.                                     |
| AUTH-04 | Roubo/replay de sessão por XSS, storage inseguro, dispositivo perdido ou refresh token copiado.                          | TLS; JWT de 1 h; refresh rotation/reuse de 10 s; CSP sem terceiros em auth; redaction; SecureStore mobile; logout local/global explícitos.                                      | Testes verificam storage por plataforma, ausência de token em URL/log, renovação, expiração, logout local e global.                 | Parcial: cliente web usa PKCE, renovação e logout; CSP restringe origens, mas ainda permite inline do Next; mobile não foi implementado. | **Alto — Web/Mobile + Security.** Dados reais bloqueados até mobile, CSP e testes hospedados; o access token pode sobreviver ao logout até expirar.                |
| AUTH-05 | BOLA/IDOR lê ou grava perfil/aceite de outra pessoa.                                                                     | Grants mínimos; RLS `to authenticated`; `auth.uid()` comparado ao `user_id`; tabelas forçam RLS; aceite imutável.                                                               | `identity_foundation.test.sql`: 35 verificações, incluindo tentativas cruzadas e `anon`; este padrão se repete em cada tabela nova. | Implementado e validado em staging.                                                                                                      | **Baixo — Data.** Aceito para staging sintético; nova relação sem teste negativo bloqueia merge.                                                                   |
| AUTH-06 | Menor declarado, aceite forjado ou falha entre criar Auth e persistir perfil/consentimentos deixa conta órfã/utilizável. | Declaração positiva e duas versões aprovadas; operação server-side atômica; todas as políticas de produto exigem conta elegível; `user_metadata` nunca concede papel.           | SQL/integration rejeita falso, ausente, versão desconhecida e falha parcial; prova que conta incompleta não acessa produto.         | Parcial: trigger atômico, allowlist privada e 41 verificações SQL foram implementados; falta prova hospedada e versão jurídica aprovada. | **Alto — Produto + Privacy + Data.** Somente contas sintéticas; US-001 não fecha antes da aprovação jurídica e do teste hospedado.                                 |
| AUTH-07 | Link de recuperação reutilizado, vazado, enviado em massa ou redirecionado para origem indevida.                         | Token gerado e validado pelo Supabase; redirect exato; mensagem genérica; limite/frequência; senha confirmada duas vezes; retorno ao login; opção de revogar todas as sessões.  | Integração/E2E cobre e-mail existente/inexistente, token inválido/expirado/reutilizado e troca seguida de login.                    | Parcial: fluxo web PKCE, senha confirmada e retorno ao login existem; callbacks e e-mail hospedados não foram provados.                  | **Alto — Security + Platform.** Recuperação permanece bloqueada até e-mail e callbacks hospedados serem provados.                                                  |
| AUTH-08 | Chave privilegiada, senha ou token entra no bundle, commit, CI, log ou ferramenta de produto.                            | Apenas URL e chave publicável no cliente; scanner bloqueante; stores por ambiente; allowlist de telemetry sem payload de auth.                                                  | `check:client-environment`, `check:secrets`, inspeção do bundle e testes que falham se logger recebe campos proibidos.              | Parcial: contrato tipado tem 11 testes, scanners e build passaram; stores Cloudflare/EAS aguardam owner autorizado.                      | **Alto — Platform.** FND-018 e login real continuam bloqueados até a ativação direta e auditoria dos bundles.                                                      |

## Matriz mínima de verificação de FND-013/US-001

| Teste                           | Prova esperada                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| AUTH-T01 — cadastro elegível    | Adulto + versões aprovadas criam Auth, perfil e dois aceites sem estado parcial.                                         |
| AUTH-T02 — menor/aceite ausente | Requisição falha fechada e não cria conta utilizável.                                                                    |
| AUTH-T03 — não enumeração       | Casos existente/inexistente produzem a mesma copy pública em login, cadastro e reset.                                    |
| AUTH-T04 — abuso                | Repetição recebe limite e caminho de recuperação; nenhuma mensagem confirma conta.                                       |
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
4. O slice mobile precisa implementar SecureStore e os testes de sessão; os
   testes hospedados precisam completar a matriz acima.

## Referências normativas e técnicas

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
