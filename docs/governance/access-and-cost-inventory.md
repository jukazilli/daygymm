# Inventário operacional de acessos e custos

Status: parcial, revisado em 21 de agosto de 2026 para o FND-001.

Este inventário registra superfícies, funções e evidências. Nomes de pessoa,
e-mails, tokens, recovery codes, IDs de faturamento e valores secretos não
pertencem ao repositório. O gestor de senhas e os painéis dos provedores são as
fontes autorizadas para esses valores.

## Critério de fechamento

Uma superfície crítica só fica pronta quando possui:

1. owner primário e substituto, preferencialmente por conta de função;
2. MFA e recuperação comprovados no painel do provedor;
3. menor privilégio compatível com a operação;
4. custo, alerta ou condição explícita de ativação;
5. evidência recente e procedimento de revogação.

Ausência de sessão local não prova ausência de owner. Ela indica que a conta
operacional atual não pode executar ou verificar a ação e mantém o item aberto.

## Estado verificado

| Superfície      | Ambiente                       | Ownership/acesso observado                                                                                                                                                                                                                                                      | MFA e recuperação                                                                                  | Custo e alerta                                                                                                                                                                               | Evidência segura                                                                                                                             | Decisão                                                                                                      |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GitHub          | repositório                    | Um mantenedor com administração; `main` protegida e environment `staging` limitado à branch autorizada.                                                                                                                                                                         | Não verificável pela API do repositório; owner precisa confirmar MFA, recovery codes e substituto. | Actions permanece no plano da conta; consumo precisa entrar no cost ledger antes do beta externo.                                                                                            | `gh auth status`, collaborators, environment e proteção consultados em 13/08/2026; sem registrar token ou identidade pessoal.                | Operação de staging autorizada; risco de owner único permanece aberto.                                       |
| Google Cloud    | staging                        | Sessão operacional ativa; projeto host com dois principals em `roles/owner`; deploy usa Workload Identity Federation e service accounts dedicadas, sem chave persistente no GitHub. O scheduler do worker usa identidade OIDC separada com invocação apenas no serviço privado. | MFA e recuperação das contas humanas não são expostos pela CLI; confirmação continua pendente.     | Billing ativo; budget `daygym-staging-monthly-budget` de R$ 50/mês confirmado com alertas em 50%, 80% e 100%. Um job do Cloud Scheduler fica sujeito ao free tier compartilhado.             | Billing, budget, IAM por contagem, serviços Cloud Run e job `daygym-domain-events-staging` consultados em 13/08/2026.                        | Fundação de staging pode continuar; produção e revisão nominal de menor privilégio permanecem bloqueadas.    |
| Cloudflare      | staging                        | Owner autenticado no painel; o projeto `daygym-web-staging` publica a branch `staging` e recebeu as três variáveis públicas web no ambiente Production. A sessão local do Wrangler continua ausente e não é necessária para o deploy pelo GitHub.                               | O login forte do owner foi exercitado; recovery e substituto ainda não foram comprovados.          | Pages permanece na capacidade atual; limites e owner de cobrança precisam do gate comercial.                                                                                                 | Publicação `348310b9-709d-4232-a31e-d788f484220a` concluída e cadastro hospedado alcançou o Supabase em 13/08/2026.                          | Deploy e configuração pública de staging estão operacionais; recuperação e substituto permanecem abertos.    |
| Supabase        | staging                        | Owner autenticado no painel; migrations seguem pelo secret do GitHub, configuração pública permanece no Cloudflare e SMTP Resend fica cifrado no store do Auth. O Data API expõe somente `api`, com grants explícitos/RLS e `public` fora da superfície.                        | O desafio adicional do owner foi exercitado; recovery e substituto ainda não foram comprovados.    | Projeto de staging está no plano Free; SMTP customizado elevou o limite hospedado para 30 e-mails/h, com intervalo mínimo de 60 s por destinatário.                                          | Cadastro e autenticação por senha retornaram HTTP 200; recuperação foi entregue; `api` negou anônimo e `public` foi recusado em 13/08/2026.  | E-mail e fronteira mínima do Data API estão operacionais; E2E de sessão/logout ainda precisa fechar FND-013. |
| Resend          | staging/auth                   | Domínio `soberania.tech` verificado; Supabase envia por TLS como `DayGym`; a chave operacional tem somente `sending_access`. A chave exposta na configuração foi substituída após prova e revogada.                                                                             | Owner, MFA, recuperação e substituto da conta Resend ainda não foram comprovados.                  | Capacidade atual atende ao staging; plano, alertas de bounce/complaint e gatilho de upgrade precisam entrar no gate comercial antes do beta externo.                                         | Dois e-mails de recuperação entregues; o segundo registrou uso da chave rotacionada antes da revogação da anterior.                          | Aceito para staging sintético; gestão de owner, alertas e custo permanece aberta antes do beta externo.      |
| Expo/EAS        | development/preview/production | Projeto remoto `@soberania-tech/daygym` vinculado; perfis, IDs e channels versionados; ambientes públicos de development/preview configurados sem expor valores.                                                                                                                | Owner autenticou a operação; MFA, recuperação e credenciais de loja ainda não foram comprovados.   | Build remoto de preview foi autorizado e concluído na capacidade atual; contratação adicional continua sem autorização implícita.                                                            | Build Android `ffbaec61-aeca-4fbb-a90b-292cb8f122a2` finalizado em 20/08/2026 e APK de preview liberado para prova física.                   | EAS e APK direto estão operacionais; FND-016 permanece parcial até recuperação e credenciais de loja.        |
| Apple Developer | iOS/production                 | Inscrição individual aguarda validação alternativa/manual do Apple Developer Support após documentos válidos retornarem `Invalid Submission`.                                                                                                                                   | Conta autenticada, mas associação, certificado e provisioning profile não estão disponíveis.       | Taxa não foi concluída enquanto a identidade permanece em análise; nenhuma contratação ou credencial de terceiro é autorizada.                                                               | Bloqueio externo registrado em 20/08/2026; nenhuma credencial Apple foi criada ou armazenada no EAS.                                         | Build físico de iPhone bloqueado; configuração versionada e desenvolvimento do PWA continuam.                |
| Google Play     | Android/teste e production     | Conta Play Console e app ainda não foram criados; pacote definitivo `com.daygym.mobile` permanece sem registro na loja.                                                                                                                                                         | Owner, MFA, recuperação, Play App Signing e credenciais de submissão pendentes.                    | Taxa única de US$ 25 adiada por falta de orçamento; previsão do owner para pagamento e reavaliação em 03/09/2026. Alertar antes de qualquer etapa dependente e não contratar implicitamente. | Decisão do owner registrada em 21/08/2026; o APK `preview` comprova que Play Console não é requisito do teste Android por instalação direta. | `Blocked` somente para teste/instalação pela Play Store e submit. PWA, staging, EAS e APK direto continuam.  |

## Responsabilidades mínimas

| Função                    | Responsabilidade                                                             | Estado                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Owner de produto/fundador | Aprovar orçamento, contratação, risco residual e substituto.                 | Exercida no projeto; substituto formal pendente.                                                 |
| Plataforma/operação       | GitHub, Cloudflare, Google Cloud, Supabase, Expo/EAS e resposta a vazamento. | Exercida pelo mantenedor atual; separação de duties pendente.                                    |
| Billing owner             | Receber alertas, revisar fatura e autorizar aumento de capacidade.           | Google Cloud tem budget técnico; owner nominal fora do repositório ainda precisa ser confirmado. |
| Release owner             | Aprovar build/submit mobile, rollback e credenciais de loja.                 | Build EAS preview autorizado; titularidade e credenciais permanecem pendentes antes do submit.   |

## Próximas ações para fechar FND-001

1. Confirmar fora do repositório owner primário, substituto, MFA e recovery codes
   de GitHub, Google Cloud, Cloudflare, Supabase e Expo/EAS.
2. Autenticar owners autorizados em Cloudflare, Supabase Management e EAS sem
   transportar tokens pelo chat, código, issue ou log.
3. Definir conta de função/gestor de senhas e testar recuperação sem revelar
   valores.
4. Registrar no cost ledger o responsável por fatura e o gatilho de upgrade de
   cada provedor; nenhuma contratação é implícita.
5. Revalidar menor privilégio e remover sessões ou acessos que não tenham
   finalidade operacional.
6. Em 03/09/2026, ou antes de qualquer dependência real do Google Play Console,
   alertar o owner e revalidar orçamento, pagamento, tipo de conta e condição
   de retomada. PWA e APK direto não aguardam esse gate.

## Revalidação

Reabrir ou revisar este inventário quando houver novo provider, mudança de
owner, incidente, contratação, promoção para production, rotação de credencial
ou ausência de evidência por mais de 90 dias.
