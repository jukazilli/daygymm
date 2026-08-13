# Inventário operacional de acessos e custos

Status: parcial, revisado em 13 de agosto de 2026 para o FND-001.

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

| Superfície         | Ambiente                       | Ownership/acesso observado                                                                                                                                                                                                                                                      | MFA e recuperação                                                                                  | Custo e alerta                                                                                                                                                                   | Evidência segura                                                                                                              | Decisão                                                                                                   |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GitHub             | repositório                    | Um mantenedor com administração; `main` protegida e environment `staging` limitado à branch autorizada.                                                                                                                                                                         | Não verificável pela API do repositório; owner precisa confirmar MFA, recovery codes e substituto. | Actions permanece no plano da conta; consumo precisa entrar no cost ledger antes do beta externo.                                                                                | `gh auth status`, collaborators, environment e proteção consultados em 13/08/2026; sem registrar token ou identidade pessoal. | Operação de staging autorizada; risco de owner único permanece aberto.                                    |
| Google Cloud       | staging                        | Sessão operacional ativa; projeto host com dois principals em `roles/owner`; deploy usa Workload Identity Federation e service accounts dedicadas, sem chave persistente no GitHub. O scheduler do worker usa identidade OIDC separada com invocação apenas no serviço privado. | MFA e recuperação das contas humanas não são expostos pela CLI; confirmação continua pendente.     | Billing ativo; budget `daygym-staging-monthly-budget` de R$ 50/mês confirmado com alertas em 50%, 80% e 100%. Um job do Cloud Scheduler fica sujeito ao free tier compartilhado. | Billing, budget, IAM por contagem, serviços Cloud Run e job `daygym-domain-events-staging` consultados em 13/08/2026.         | Fundação de staging pode continuar; produção e revisão nominal de menor privilégio permanecem bloqueadas. |
| Cloudflare         | staging                        | Owner autenticado no painel; o projeto `daygym-web-staging` publica a branch `staging` e recebeu as três variáveis públicas web no ambiente Production. A sessão local do Wrangler continua ausente e não é necessária para o deploy pelo GitHub.                               | O login forte do owner foi exercitado; recovery e substituto ainda não foram comprovados.          | Pages permanece na capacidade atual; limites e owner de cobrança precisam do gate comercial.                                                                                     | Publicação `348310b9-709d-4232-a31e-d788f484220a` concluída e cadastro hospedado alcançou o Supabase em 13/08/2026.           | Deploy e configuração pública de staging estão operacionais; recuperação e substituto permanecem abertos. |
| Supabase           | staging                        | Owner autenticado no painel; migrations seguem pelo secret do GitHub e a chave publicável foi transportada diretamente ao store do Cloudflare, sem persistência no repositório ou documentação.                                                                                 | O desafio adicional do owner foi exercitado; recovery e substituto ainda não foram comprovados.    | Projeto de staging existe na organização escolhida; plano e gatilho de upgrade permanecem no gate de produção.                                                                   | Cadastro hospedado retornou HTTP 200 no endpoint Auth em 13/08/2026, sem registrar a chave ou o usuário neste inventário.     | Auth web chegou à confirmação de e-mail; sessão completa e administração de produção permanecem abertas.  |
| Expo/EAS           | development/preview/production | Perfis, IDs e channels estão versionados; nenhum projeto remoto está vinculado e a conta operacional não possui sessão EAS.                                                                                                                                                     | Owner de conta, MFA, recuperação e credenciais de loja não comprovados.                            | Nenhum plano adicional ou build remoto foi autorizado neste corte.                                                                                                               | `eas-cli 21.8.0 whoami` retornou `Not logged in` em 13/08/2026.                                                               | FND-016 e prova física de FND-017 permanecem bloqueados até autenticação do owner.                        |
| Lojas Apple/Google | production                     | Nenhuma conta ou credencial de submissão foi comprovada.                                                                                                                                                                                                                        | Owner, MFA e recuperação pendentes.                                                                | Contratação e taxas não autorizadas sem budget e responsável.                                                                                                                    | Ausência explícita de evidência; nenhum segredo de loja existe no repositório.                                                | Fora do staging; obrigatório antes do primeiro submit.                                                    |

## Responsabilidades mínimas

| Função                    | Responsabilidade                                                             | Estado                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Owner de produto/fundador | Aprovar orçamento, contratação, risco residual e substituto.                 | Exercida no projeto; substituto formal pendente.                                                 |
| Plataforma/operação       | GitHub, Cloudflare, Google Cloud, Supabase, Expo/EAS e resposta a vazamento. | Exercida pelo mantenedor atual; separação de duties pendente.                                    |
| Billing owner             | Receber alertas, revisar fatura e autorizar aumento de capacidade.           | Google Cloud tem budget técnico; owner nominal fora do repositório ainda precisa ser confirmado. |
| Release owner             | Aprovar build/submit mobile, rollback e credenciais de loja.                 | Pendente antes do primeiro build EAS/submit.                                                     |

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

## Revalidação

Reabrir ou revisar este inventário quando houver novo provider, mudança de
owner, incidente, contratação, promoção para production, rotação de credencial
ou ausência de evidência por mais de 90 dias.
