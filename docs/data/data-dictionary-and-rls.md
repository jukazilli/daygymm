# Dicionário de dados e matriz RLS

Status: baseline executável do `FND-011`, atualizado pelo comando transacional
de finalização do `FND-022`, pelo contexto progressivo da `US-003`, pela
escolha de origem do plano da `US-004` e pela importação oficial da `US-005`.
O recorte pré-US-007 acrescenta a projeção semanal explícita do plano importado.

## Escopo e precedência

Este contrato deriva das migrations ordenadas em `supabase/migrations`, dos testes
pgTAP em `supabase/tests/identity_foundation.test.sql` e da arquitetura canônica.
Em divergência, a migration descreve o estado executável; o gate
`pnpm check:data-contract` impede que novas tabelas, políticas ou testes negativos
fiquem sem rastreabilidade neste documento.

`auth.users` pertence ao Supabase Auth e não é uma tabela canônica do DayGym. O
DayGym referencia somente seu identificador e mantém credenciais, sessões e
segredos fora dos schemas `api` e `private`.

O nome técnico `api.consents` registra aceitação de Termos de Serviço e ciência do
Aviso de Privacidade exigidos na criação da conta. Isso não transforma essas
aceitações em consentimento LGPD para finalidades opcionais, dados de saúde,
analytics, comunidade ou comércio. Bases legais, retenção definitiva e mecanismos
de revogação por finalidade serão fechados no `FND-029` antes de dados reais.

## Dicionário de dados

Classificação usada neste corte: identificador pessoal, declaração pessoal,
evidência contratual ou configuração interna. Nenhuma tabela atual armazena dado
de saúde.

### `api.profiles`

Owner: função `private.initialize_identity_from_auth_user()`.

Finalidade: registrar a elegibilidade mínima da conta, vinculada em relação 1:1 ao
usuário autenticado. Escrita de responsabilidade exclusiva da função
`private.initialize_identity_from_auth_user()`.

| Campo               | Tipo/restrição                        | Finalidade                               | Classificação         | Retenção atual                                                               | Índice |
| ------------------- | ------------------------------------- | ---------------------------------------- | --------------------- | ---------------------------------------------------------------------------- | ------ |
| `user_id`           | UUID, PK, FK `auth.users.id`, cascade | Vincular perfil e identidade autenticada | Identificador pessoal | Ciclo de vida da conta; removido em cascade quando o usuário Auth é excluído | PK     |
| `is_adult`          | boolean, obrigatório, somente `true`  | Registrar declaração de idade mínima     | Declaração pessoal    | Mesmo ciclo do perfil                                                        | Não    |
| `adult_declared_at` | timestamptz, obrigatório              | Data da declaração                       | Evidência contratual  | Mesmo ciclo do perfil                                                        | Não    |

### `api.consents`

Owner: função `private.initialize_identity_from_auth_user()`.

Finalidade: manter histórico imutável das versões dos documentos obrigatórios
aceitos na criação da conta. Escrita de responsabilidade exclusiva da função
`private.initialize_identity_from_auth_user()`.

| Campo              | Tipo/restrição                           | Finalidade                               | Classificação         | Retenção atual                                          | Índice          |
| ------------------ | ---------------------------------------- | ---------------------------------------- | --------------------- | ------------------------------------------------------- | --------------- |
| `id`               | UUID, PK                                 | Identificar a evidência                  | Identificador interno | Ciclo de vida da conta; removido em cascade pelo perfil | PK              |
| `user_id`          | UUID, FK `api.profiles.user_id`, cascade | Associar evidência ao titular            | Identificador pessoal | Mesmo ciclo da evidência                                | Unique composto |
| `document`         | text, enum por check                     | Distinguir termos e aviso de privacidade | Evidência contratual  | Mesmo ciclo da evidência                                | Unique composto |
| `document_version` | text, 1–64 caracteres                    | Fixar a versão aceita                    | Evidência contratual  | Mesmo ciclo da evidência                                | Unique composto |
| `accepted_at`      | timestamptz, obrigatório                 | Registrar quando ocorreu a aceitação     | Evidência contratual  | Mesmo ciclo da evidência                                | Não             |

O estado executável atual remove essas evidências com a exclusão da conta. Qualquer
retenção posterior, bloqueio legal ou anonimização exige decisão no `FND-029` e uma
migration explícita; não existe retenção implícita.

### `private.legal_document_versions`

Owner: administração da plataforma por migration ou operação privilegiada.

Finalidade: allowlist interna das versões documentais aceitas pelo trigger de
cadastro. Publicação e ativação são responsabilidade operacional da plataforma;
clientes não recebem acesso.

| Campo              | Tipo/restrição                     | Finalidade                            | Classificação        | Retenção atual                                                                  | Índice      |
| ------------------ | ---------------------------------- | ------------------------------------- | -------------------- | ------------------------------------------------------------------------------- | ----------- |
| `document`         | text, PK composta, enum por check  | Identificar o documento               | Configuração interna | Sem expurgo automático; preservar enquanto a versão puder ser usada ou auditada | PK composta |
| `document_version` | text, PK composta, 1–64 caracteres | Identificar a versão                  | Configuração interna | Mesmo ciclo do registro                                                         | PK composta |
| `environment`      | text, `staging` ou `production`    | Restringir a versão ao ambiente       | Configuração interna | Mesmo ciclo do registro                                                         | Não         |
| `is_active`        | boolean                            | Autorizar ou bloquear novos cadastros | Configuração interna | Mesmo ciclo do registro                                                         | Não         |
| `published_at`     | timestamptz, obrigatório           | Registrar publicação                  | Configuração interna | Mesmo ciclo do registro                                                         | Não         |

### `platform.job_outbox`

Owner: plataforma e consumidores internos do worker.

Finalidade: persistir a intenção de publicar eventos de domínio aprovados antes
do despacho para a fila durável privada.

| Campo              | Finalidade                                    | Classificação            | Retenção atual                                                           | Índice                           |
| ------------------ | --------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ | -------------------------------- |
| `event_id`         | Identificar e deduplicar o evento             | Identificador técnico    | Sem expurgo automático no staging sintético; política final no `FND-029` | PK                               |
| `event_name`       | Restringir o tipo aos eventos v1 aprovados    | Metadado operacional     | Mesmo ciclo do evento                                                    | Não                              |
| `event_version`    | Fixar a versão do contrato                    | Metadado operacional     | Mesmo ciclo do evento                                                    | Não                              |
| `event_envelope`   | Preservar o envelope mínimo para despacho     | Dado interno allowlisted | Mesmo ciclo do evento                                                    | Não                              |
| `occurred_at`      | Registrar quando o fato ocorreu               | Metadado operacional     | Mesmo ciclo do evento                                                    | Não                              |
| `correlation_id`   | Correlacionar comando, evento e processamento | Identificador técnico    | Mesmo ciclo do evento                                                    | Não                              |
| `producer`         | Identificar o módulo emissor                  | Metadado operacional     | Mesmo ciclo do evento                                                    | Não                              |
| `available_at`     | Controlar disponibilidade para despacho       | Metadado operacional     | Mesmo ciclo do evento                                                    | `job_outbox_pending_idx` parcial |
| `dispatched_at`    | Registrar publicação na fila                  | Metadado operacional     | Mesmo ciclo do evento                                                    | Não                              |
| `queue_message_id` | Vincular a mensagem pgmq                      | Identificador técnico    | Mesmo ciclo do evento                                                    | Unique                           |
| `created_at`       | Registrar persistência no outbox              | Metadado operacional     | Mesmo ciclo do evento                                                    | `job_outbox_pending_idx` parcial |

### `api.training_sessions`

Owner: função `private.complete_training_session()`.

Finalidade: persistir a confirmação canônica de uma sessão concluída e a
identidade estável do evento correspondente. O recorte prático de M1 adiciona o
vínculo imutável com plano/sessão, início, duração e contagem de exercícios; sets,
carga e desempenho detalhado permanecem em cortes posteriores.

| Campo                    | Tipo/restrição                              | Finalidade                                     | Classificação              | Retenção atual                                                               | Índice                                      |
| ------------------------ | ------------------------------------------- | ---------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| `session_id`             | UUID, PK                                    | Identificar a sessão canônica                  | Identificador técnico      | Ciclo de vida da conta; política final no `FND-029`                          | PK                                          |
| `user_id`                | UUID, FK `api.profiles.user_id`, cascade    | Vincular a sessão ao titular                   | Identificador pessoal      | Removido em cascade com o perfil enquanto não houver decisão legal diferente | `training_sessions_user_completed_idx`      |
| `operation_id`           | text, 16–128, formato técnico, unique/owner | Deduplicar replay do comando offline           | Identificador técnico      | Mesmo ciclo da sessão                                                        | Unique composto                             |
| `completed_at`           | timestamptz, obrigatório                    | Registrar o instante declarado da finalização  | Dado de atividade sensível | Mesmo ciclo da sessão                                                        | `training_sessions_user_completed_idx`      |
| `version`                | integer positivo                            | Controlar a versão canônica da sessão          | Metadado técnico           | Mesmo ciclo da sessão                                                        | Não                                         |
| `completion_event_id`    | UUID, unique                                | Fixar o evento emitido na primeira finalização | Identificador técnico      | Mesmo ciclo da sessão/evento                                                 | Unique                                      |
| `completion_consumed_at` | timestamptz, opcional                       | Confirmar aplicação idempotente do handler     | Metadado operacional       | Mesmo ciclo da sessão                                                        | Não                                         |
| `plan_id`                | UUID, FK `api.training_plans`, opcional     | Vincular uma conclusão prática ao plano        | Identificador técnico      | Mesmo ciclo da sessão                                                        | `training_sessions_plan_id_idx`             |
| `plan_version_id`        | UUID, FK de versão, opcional                | Fixar a versão executada                       | Identificador técnico      | Mesmo ciclo da sessão                                                        | `training_sessions_user_plan_completed_idx` |
| `planned_session_id`     | UUID, FK de sessão planejada, opcional      | Fixar o treino executado                       | Identificador técnico      | Mesmo ciclo da sessão                                                        | `training_sessions_planned_session_id_idx`  |
| `started_at`             | timestamptz, opcional                       | Registrar o início da execução prática         | Dado de atividade sensível | Mesmo ciclo da sessão                                                        | Não                                         |
| contagens e duração      | inteiros não negativos, opcionais           | Resumir checklist concluído e tempo decorrido  | Dado de atividade sensível | Mesmo ciclo da sessão                                                        | Não                                         |
| `created_at`             | timestamptz, obrigatório                    | Registrar a persistência no servidor           | Metadado operacional       | Mesmo ciclo da sessão                                                        | Não                                         |

### `api.onboarding_contexts`

Owner: usuário autenticado, limitado por grants de coluna, RLS e pela função
`api.save_onboarding_context()` executada como invoker.

Finalidade: salvar e retomar apenas o contexto mínimo e um dos três caminhos
de plano: objetivo, experiência comportamental, frequência, duração,
equipamentos, estado amplo de limitação e origem escolhida. Não armazena peso,
diagnóstico, descrição clínica ou texto livre. A função
`api.select_plan_source()` permite substituir a origem até a primeira sessão
concluída e o trigger privado impede contorno por escrita direta.

| Campo                     | Tipo/restrição                                  | Finalidade                                      | Classificação              | Retenção atual                                                               | Índice |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- | ------ |
| `user_id`                 | UUID, PK, FK `api.profiles.user_id`, cascade    | Vincular o contexto ao titular                  | Identificador pessoal      | Removido em cascade com o perfil enquanto não houver decisão legal diferente | PK     |
| `goal`                    | text opcional, allowlist                        | Registrar o objetivo principal                  | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `experience`              | text opcional, allowlist comportamental         | Adequar linguagem e caminho do plano            | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `weekly_days`             | smallint opcional, entre 2 e 5                  | Registrar frequência sustentável                | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `session_minutes`         | smallint opcional, 30/45/60/75                  | Registrar tempo disponível                      | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `equipment_context`       | text opcional, allowlist                        | Limitar o plano ao ambiente disponível          | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `limitation_status`       | text opcional, allowlist sem detalhe clínico    | Direcionar revisão profissional quando indicada | Dado de atividade sensível | Mesmo ciclo do contexto                                                      | Não    |
| `current_step`            | smallint, entre 0 e 6, progresso coerente       | Retomar sem repetir respostas                   | Metadado de uso            | Mesmo ciclo do contexto                                                      | Não    |
| `completed_at`            | timestamptz opcional, normalizado pelo servidor | Registrar confirmação explícita                 | Metadado de uso            | Mesmo ciclo do contexto                                                      | Não    |
| `plan_source`             | text opcional, allowlist de três caminhos       | Registrar a origem de plano escolhida           | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `plan_source_selected_at` | timestamptz opcional, normalizado pelo servidor | Registrar a última troca permitida              | Metadado de uso            | Mesmo ciclo do contexto                                                      | Não    |
| `updated_at`              | timestamptz, normalizado pelo servidor          | Registrar a última atualização                  | Metadado operacional       | Mesmo ciclo do contexto                                                      | Não    |

### `api.training_plans`

Owner: comandos privados de importação e renomeação, chamados por wrappers
autenticados limitados no schema `api`.

Finalidade: manter o plano pertencente ao usuário e apontar explicitamente para
sua versão ativa. O cliente possui leitura do próprio plano e pode editar somente
seu nome pelo comando dedicado; não recebe escrita direta neste agregado.

| Campo               | Tipo/restrição                                   | Finalidade                  | Classificação         | Retenção atual                              | Índice                            |
| ------------------- | ------------------------------------------------ | --------------------------- | --------------------- | ------------------------------------------- | --------------------------------- |
| `plan_id`           | UUID, PK                                         | Identificar o plano         | Identificador técnico | Ciclo da conta; política final no `FND-029` | PK                                |
| `user_id`           | UUID, FK `api.profiles.user_id`, cascade         | Vincular o plano ao titular | Identificador pessoal | Removido em cascade com o perfil            | `training_plans_user_updated_idx` |
| `name`              | text, 1–80                                       | Nomear o plano              | Conteúdo de treino    | Mesmo ciclo do plano                        | Não                               |
| `provenance`        | somente `official_xlsx`                          | Registrar a origem          | Metadado operacional  | Mesmo ciclo do plano                        | Não                               |
| `active_version_id` | UUID, FK de versão, opcional durante a transação | Apontar a versão ativa      | Identificador técnico | Mesmo ciclo do plano                        | FK                                |
| `current_version`   | inteiro positivo                                 | Expor a versão corrente     | Metadado operacional  | Mesmo ciclo do plano                        | Não                               |
| `session_count`     | inteiro, 1–14                                    | Resumir sessões             | Metadado de treino    | Mesmo ciclo do plano                        | Não                               |
| `item_count`        | inteiro, 1–300                                   | Resumir itens               | Metadado de treino    | Mesmo ciclo do plano                        | Não                               |
| `created_at`        | timestamptz                                      | Registrar criação           | Metadado operacional  | Mesmo ciclo do plano                        | Não                               |
| `updated_at`        | timestamptz                                      | Ordenar planos recentes     | Metadado operacional  | Mesmo ciclo do plano                        | `training_plans_user_updated_idx` |

### `api.training_plan_versions`

Owner: comando `private.import_official_xlsx_plan()`.

Finalidade: preservar uma versão imutável confirmada a partir da proposta
normalizada no aparelho. Guarda somente hash, nome sanitizado e tamanho como
proveniência; o arquivo XLSX original não é enviado nem armazenado.

| Campo               | Tipo/restrição                          | Finalidade                           | Classificação         | Retenção atual  | Índice                                    |
| ------------------- | --------------------------------------- | ------------------------------------ | --------------------- | --------------- | ----------------------------------------- |
| `version_id`        | UUID, PK                                | Identificar a versão                 | Identificador técnico | Ciclo do plano  | PK                                        |
| `plan_id`           | UUID, FK `api.training_plans`, cascade  | Vincular ao plano                    | Identificador técnico | Ciclo do plano  | Unique com `version_number`               |
| `user_id`           | UUID, FK `api.profiles`, cascade        | Aplicar isolamento por titular       | Identificador pessoal | Ciclo da conta  | `training_plan_versions_user_created_idx` |
| `version_number`    | inteiro positivo                        | Ordenar versões                      | Metadado operacional  | Ciclo do plano  | Unique com `plan_id`                      |
| `operation_id`      | texto técnico, unique por usuário       | Deduplicar repetição do comando      | Identificador técnico | Ciclo da versão | Unique com `user_id`                      |
| `source_sha256`     | SHA-256 hexadecimal, unique por usuário | Deduplicar o mesmo arquivo           | Metadado técnico      | Ciclo da versão | Unique com `user_id`                      |
| `source_file_name`  | nome sanitizado `.xlsx`, 6–120          | Registrar proveniência sem o arquivo | Metadado do conteúdo  | Ciclo da versão | Não                                       |
| `source_size_bytes` | inteiro, 1–2.097.152                    | Evidenciar o limite validado         | Metadado técnico      | Ciclo da versão | Não                                       |
| `created_at`        | timestamptz                             | Registrar confirmação                | Metadado operacional  | Ciclo da versão | `training_plan_versions_user_created_idx` |

### `api.training_plan_sessions`

Owner: comando `private.import_official_xlsx_plan()`.

Finalidade: registrar as sessões ordenadas de uma versão importada, sem permitir
mutação direta pelo cliente.

| Campo        | Tipo/restrição                                 | Finalidade                     | Classificação         | Retenção atual  | Índice                                    |
| ------------ | ---------------------------------------------- | ------------------------------ | --------------------- | --------------- | ----------------------------------------- |
| `session_id` | UUID, PK                                       | Identificar a sessão do plano  | Identificador técnico | Ciclo da versão | PK                                        |
| `version_id` | UUID, FK `api.training_plan_versions`, cascade | Vincular à versão imutável     | Identificador técnico | Ciclo da versão | `training_plan_sessions_user_version_idx` |
| `user_id`    | UUID, FK `api.profiles`, cascade               | Aplicar isolamento por titular | Identificador pessoal | Ciclo da conta  | `training_plan_sessions_user_version_idx` |
| `day_order`  | inteiro, 1–14, unique por versão               | Ordenar o dia                  | Conteúdo de treino    | Ciclo da versão | Unique com `version_id`                   |
| `name`       | texto, 1–80                                    | Nomear a sessão                | Conteúdo de treino    | Ciclo da versão | Não                                       |

### `api.training_plan_schedule_entries`

Owner: trigger `private.seed_training_plan_schedule_entry()`.

Finalidade: projetar cada sessão imutável em uma agenda semanal explícita. O
contrato usa `1 = segunda-feira` até `7 = domingo`; uma segunda volta do plano
ocupa o slot 2 do mesmo dia. Planos existentes são retropreenchidos e novas
sessões recebem a projeção no mesmo commit da importação.

| Campo                | Tipo/restrição                      | Finalidade                            | Classificação         | Retenção atual  | Índice                                            |
| -------------------- | ----------------------------------- | ------------------------------------- | --------------------- | --------------- | ------------------------------------------------- |
| `schedule_entry_id`  | UUID, PK                            | Identificar a projeção semanal        | Identificador técnico | Ciclo da versão | PK                                                |
| `version_id`         | UUID, FK de versão, cascade         | Vincular à versão imutável            | Identificador técnico | Ciclo da versão | Unique com `weekday` e `slot_order`               |
| `planned_session_id` | UUID, FK de sessão, cascade, unique | Vincular ao treino executável         | Identificador técnico | Ciclo da versão | Unique                                            |
| `user_id`            | UUID, FK de perfil, cascade         | Aplicar isolamento por titular        | Identificador pessoal | Ciclo da conta  | `training_plan_schedule_entries_user_version_idx` |
| `weekday`            | inteiro, 1–7                        | Representar segunda a domingo         | Conteúdo de agenda    | Ciclo da versão | Unique com `version_id` e `slot_order`            |
| `slot_order`         | inteiro, 1–2                        | Ordenar até duas sessões no mesmo dia | Conteúdo de agenda    | Ciclo da versão | Unique com `version_id` e `weekday`               |
| timestamps           | timestamptz do servidor             | Auditar criação e atualização         | Metadado operacional  | Ciclo da versão | Não                                               |

### `api.training_plan_items`

Owner: comando `private.import_official_xlsx_plan()`.

Finalidade: armazenar itens normalizados e limitados de cada sessão importada.
Fórmulas, macros, links, objetos e conteúdo arbitrário da planilha não entram
nesta relação.

| Campo              | Tipo/restrição                                 | Finalidade                                 | Classificação         | Retenção atual  | Índice                                 |
| ------------------ | ---------------------------------------------- | ------------------------------------------ | --------------------- | --------------- | -------------------------------------- |
| `item_id`          | UUID, PK                                       | Identificar o item                         | Identificador técnico | Ciclo da versão | PK                                     |
| `session_id`       | UUID, FK `api.training_plan_sessions`, cascade | Vincular à sessão                          | Identificador técnico | Ciclo da versão | Unique com `item_order`                |
| `version_id`       | UUID, FK `api.training_plan_versions`, cascade | Vincular à versão                          | Identificador técnico | Ciclo da versão | `training_plan_items_user_version_idx` |
| `user_id`          | UUID, FK `api.profiles`, cascade               | Aplicar isolamento por titular             | Identificador pessoal | Ciclo da conta  | `training_plan_items_user_version_idx` |
| `item_order`       | inteiro, 1–100, unique por sessão              | Ordenar o item                             | Conteúdo de treino    | Ciclo da versão | Unique com `session_id`                |
| `exercise_name`    | texto, 1–120                                   | Nomear o exercício                         | Conteúdo de treino    | Ciclo da versão | Não                                    |
| `modality`         | allowlist de cinco modalidades                 | Definir regra de execução                  | Conteúdo de treino    | Ciclo da versão | Não                                    |
| `sets`             | inteiro, 1–20                                  | Definir séries                             | Conteúdo de treino    | Ciclo da versão | Não                                    |
| medidas e descanso | inteiros opcionais com limites                 | Definir repetição/tempo/distância/descanso | Conteúdo de treino    | Ciclo da versão | Não                                    |
| circuito e notas   | textos opcionais limitados                     | Agrupar e orientar o item                  | Conteúdo de treino    | Ciclo da versão | Não                                    |

### `api.training_session_runs`

Owner: comandos `private.start_training_session()` e
`private.finish_practical_training_session()`.

Finalidade: manter no servidor uma única sessão ativa por usuário, ligada à
versão imutável do plano. O cliente possui leitura própria; criação, atualização
e encerramento ocorrem somente pelos comandos allowlisted. A persistência
offline e sua outbox local continuam fora deste recorte e pertencem à US-009.

| Campo                       | Tipo/restrição                    | Finalidade                        | Classificação              | Retenção atual                       | Índice                                            |
| --------------------------- | --------------------------------- | --------------------------------- | -------------------------- | ------------------------------------ | ------------------------------------------------- |
| `run_id`                    | UUID, PK                          | Identificar a execução ativa      | Identificador técnico      | Até finalização ou exclusão da conta | PK                                                |
| `user_id`                   | UUID, FK de perfil, unique        | Isolar e limitar uma sessão ativa | Identificador pessoal      | Mesmo ciclo da execução              | Unique e `training_session_runs_user_started_idx` |
| referências do plano        | FKs de plano, versão e sessão     | Fixar o alvo da execução          | Identificador técnico      | Mesmo ciclo da execução              | Índices individuais de FK                         |
| `operation_id`              | texto técnico, unique por usuário | Deduplicar o início               | Identificador técnico      | Mesmo ciclo da execução              | Unique composto                                   |
| `started_at` / `updated_at` | timestamptz do servidor           | Medir duração e última gravação   | Dado de atividade sensível | Mesmo ciclo da execução              | Início por usuário                                |

### `api.training_session_run_items`

Owner: `private.start_training_session()` cria o snapshot e
`private.complete_training_exercise()` marca sua conclusão.

Finalidade: copiar os alvos dos exercícios da versão selecionada para a sessão
ativa e registrar somente o checklist de conclusão deste primeiro recorte. Não
representa séries efetivamente executadas, carga, volume, PR ou progressão.

| Campo                     | Tipo/restrição                                    | Finalidade                      | Classificação              | Retenção atual                | Índice                                    |
| ------------------------- | ------------------------------------------------- | ------------------------------- | -------------------------- | ----------------------------- | ----------------------------------------- |
| `run_id` + `plan_item_id` | FKs, PK composta                                  | Vincular execução e exercício   | Identificador técnico      | Até a finalização da execução | PK e índice da FK do item                 |
| `user_id`                 | UUID, FK de perfil                                | Aplicar isolamento redundante   | Identificador pessoal      | Mesmo ciclo da execução       | `training_session_run_items_user_run_idx` |
| alvo do exercício         | ordem, nome, modalidade, sets e medidas limitadas | Preservar o alvo apresentado    | Conteúdo de treino         | Mesmo ciclo da execução       | Ordem unique por execução                 |
| `completed_at`            | timestamptz opcional do servidor                  | Registrar o checklist concluído | Dado de atividade sensível | Mesmo ciclo da execução       | Não                                       |

### `platform.domain_event_receipts`

Owner: handlers internos executados pelo worker.

Finalidade: manter a chave idempotente durável de cada efeito concluído. A
relação não armazena payload, usuário, sessão, correlação ou conteúdo de treino;
serve apenas para impedir reaplicação após replay da fila.

| Campo           | Tipo/restrição                   | Finalidade                               | Classificação         | Retenção atual                                                           | Índice      |
| --------------- | -------------------------------- | ---------------------------------------- | --------------------- | ------------------------------------------------------------------------ | ----------- |
| `consumer_name` | text técnico, PK composta        | Versionar o consumidor idempotente       | Metadado operacional  | Sem expurgo automático no staging sintético; política final no `FND-029` | PK composta |
| `event_id`      | UUID, PK composta                | Deduplicar o efeito para o consumidor    | Identificador técnico | Mesmo ciclo do recibo                                                    | PK composta |
| `event_name`    | `TrainingSessionCompleted`       | Fixar o contrato tratado neste corte     | Metadado operacional  | Mesmo ciclo do recibo                                                    | Não         |
| `event_version` | smallint, somente `1`            | Fixar a versão do contrato               | Metadado operacional  | Mesmo ciclo do recibo                                                    | Não         |
| `occurred_at`   | timestamptz, obrigatório         | Preservar a ordem lógica recebida        | Metadado operacional  | Mesmo ciclo do recibo                                                    | Não         |
| `processed_at`  | timestamptz, default do servidor | Registrar quando o efeito foi confirmado | Metadado operacional  | Mesmo ciclo do recibo                                                    | Não         |

## Matriz de acesso e RLS

`anon` não possui `USAGE` no schema `api`. `authenticated` recebe somente os
grants exigidos por cada caso de uso, sempre filtrados por `auth.uid()`. Escritas
canônicas críticas continuam server-owned; o contexto progressivo, pertencente
ao próprio titular, usa grants de coluna, constraints e RLS. O schema `private`
não é exposto ao cliente.

| Recurso                              | Papel                  |  SELECT |  INSERT |  UPDATE | DELETE | Política/controle                                                                                                                    | Teste negativo                  |
| ------------------------------------ | ---------------------- | ------: | ------: | ------: | -----: | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `api.profiles`                       | `anon`                 |     Não |     Não |     Não |    Não | sem `USAGE` em `api`                                                                                                                 | `RLS-N01`                       |
| `api.profiles`                       | `authenticated`        | Próprio |     Não |     Não |    Não | `profiles_select_own`; grants mínimos                                                                                                | `RLS-N02`, `RLS-N05`            |
| `api.profiles`                       | função interna         |     N/A |     Sim |     Não |    Não | trigger `SECURITY DEFINER`                                                                                                           | testes do cadastro              |
| `api.consents`                       | `anon`                 |     Não |     Não |     Não |    Não | sem `USAGE` em `api`                                                                                                                 | `RLS-N01`                       |
| `api.consents`                       | `authenticated`        | Próprio |     Não |     Não |    Não | `consents_select_own`; grants mínimos                                                                                                | `RLS-N03`, `RLS-N06`            |
| `api.consents`                       | função interna         |     N/A |     Sim |     Não |    Não | trigger `SECURITY DEFINER`                                                                                                           | testes do cadastro              |
| `private.legal_document_versions`    | `anon`/`authenticated` |     Não |     Não |     Não |    Não | schema privado; grants revogados                                                                                                     | `RLS-N04`                       |
| `private.legal_document_versions`    | administração          |     Sim |     Sim |     Sim |    Sim | migration/operação privilegiada                                                                                                      | fora do cliente                 |
| `platform.job_outbox`                | `anon`/`authenticated` |     Não |     Não |     Não |    Não | schema interno; grants revogados                                                                                                     | `RLS-N07`                       |
| `platform.job_outbox`                | funções internas       |     Sim |     Sim |     Sim |    Não | definer boundary e fila privada                                                                                                      | testes do outbox                |
| `platform.job_outbox`                | worker runtime         |     Não |     Não |     Não |    Não | apenas wrappers privados bounded                                                                                                     | `RLS-N08`                       |
| `api.training_sessions`              | `anon`                 |     Não |     Não |     Não |    Não | sem `USAGE` em `api`                                                                                                                 | `RLS-N01`                       |
| `api.training_sessions`              | `authenticated`        | Próprio |     Não |     Não |    Não | `training_sessions_select_own`; grants mínimos                                                                                       | `RLS-N09`                       |
| `api.training_sessions`              | função interna         |     Sim |     Sim |     Não |    Não | comando transacional server-owned                                                                                                    | testes do comando               |
| `api.onboarding_contexts`            | `anon`                 |     Não |     Não |     Não |    Não | sem `USAGE` em `api`                                                                                                                 | `RLS-N01`                       |
| `api.onboarding_contexts`            | `authenticated`        | Próprio | Próprio | Próprio |    Não | `onboarding_contexts_select_own`, `onboarding_contexts_insert_own`, `onboarding_contexts_update_own`; constraints e grants de coluna | `RLS-N11`, `RLS-N12`, `RLS-N13` |
| `api.training_plans`                 | `authenticated`        | Próprio |     Não |     Não |    Não | `training_plans_select_own`; escrita somente por comandos limitados                                                                  | `RLS-N14`, `RLS-N21`            |
| `api.training_plan_versions`         | `authenticated`        | Próprio |     Não |     Não |    Não | `training_plan_versions_select_own`; versões imutáveis                                                                               | `RLS-N15`                       |
| `api.training_plan_sessions`         | `authenticated`        | Próprio |     Não |     Não |    Não | `training_plan_sessions_select_own`; isolamento redundante por titular                                                               | `RLS-N16`                       |
| `api.training_plan_items`            | `authenticated`        | Próprio |     Não |     Não |    Não | `training_plan_items_select_own`; proposta revalidada pelo servidor                                                                  | `RLS-N17`                       |
| `api.training_plan_schedule_entries` | `authenticated`        | Próprio |     Não |     Não |    Não | `training_plan_schedule_entries_select_own`; projeção escrita somente pelo trigger                                                   | `RLS-N20`                       |
| `api.training_session_runs`          | `authenticated`        | Próprio |     Não |     Não |    Não | `training_session_runs_select_own`; mutação somente por comandos                                                                     | `RLS-N18`, `RLS-N22`            |
| `api.training_session_run_items`     | `authenticated`        | Próprio |     Não |     Não |    Não | `training_session_run_items_select_own`; mutação somente por comandos                                                                | `RLS-N19`                       |
| `platform.domain_event_receipts`     | `anon`/`authenticated` |     Não |     Não |     Não |    Não | schema interno; grants revogados                                                                                                     | `RLS-N10`                       |
| `platform.domain_event_receipts`     | worker runtime         |     Não |     Não |     Não |    Não | somente router privado bounded                                                                                                       | `RLS-N10`                       |
| `platform.domain_event_receipts`     | handler interno        |     Sim |     Sim |     Não |    Não | definer boundary sem payload                                                                                                         | testes do handler               |

As policies temporárias de inserção da fundação foram removidas pela migration
seguinte. As policies ativas são `profiles_select_own`, `consents_select_own`,
`training_sessions_select_own`, `training_session_runs_select_own`,
`training_session_run_items_select_own`, `onboarding_contexts_select_own`,
`onboarding_contexts_insert_own`, `onboarding_contexts_update_own` e
`training_plan_schedule_entries_select_own`. Os controles
negativos estáveis são:

- `RLS-N01`: bloqueia acesso anônimo ao schema exposto;
- `RLS-N02`: bloqueia mutação direta de elegibilidade;
- `RLS-N03`: bloqueia mutação direta do histórico de aceitação;
- `RLS-N04`: bloqueia leitura do registro privado de versões;
- `RLS-N05`: prova isolamento entre perfis autenticados;
- `RLS-N06`: prova isolamento entre históricos autenticados.
- `RLS-N07`: bloqueia acesso de clientes ao outbox e aos payloads internos.
- `RLS-N08`: bloqueia acesso direto do worker ao outbox e ao schema `pgmq`.
- `RLS-N09`: permite leitura apenas das próprias sessões e bloqueia mutação
  direta por clientes autenticados.
- `RLS-N10`: bloqueia leitura direta dos recibos e execução do handler concreto
  pelo worker; o runtime recebe somente o router bounded.
- `RLS-N11`: isola a leitura do contexto progressivo entre titulares.
- `RLS-N12`: bloqueia escrita do contexto progressivo em nome de outro titular.
- `RLS-N13`: isola a leitura da origem de plano escolhida entre titulares.
- `RLS-N14`: isola planos importados entre titulares.
- `RLS-N15`: isola versões importadas entre titulares.
- `RLS-N16`: isola sessões de plano entre titulares.
- `RLS-N17`: isola itens de plano entre titulares.
- `RLS-N18`: isola execuções ativas entre titulares.
- `RLS-N19`: bloqueia a conclusão de exercícios por outro titular.
- `RLS-N20`: isola a agenda semanal entre titulares.
- `RLS-N21`: bloqueia a renomeação de plano pertencente a outro titular.
- `RLS-N22`: bloqueia o cancelamento da execução ativa de outro titular.

## Pendências deliberadas para `FND-029`

- validar bases legais e finalidades com responsável jurídico/privacidade;
- separar consentimentos realmente opcionais do funcionamento essencial;
- definir prazos de retenção, exclusão, anonimização e eventual bloqueio legal;
- fechar exportação, exclusão, revogação e trilha de atendimento ao titular;
- revisar o inventário quando dados de saúde ou novos módulos forem modelados.

## Referências oficiais

- [Lei nº 13.709/2018 (LGPD)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [Glossário da ANPD](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/glossario-anpd)
- [Guia da ANPD: hipóteses legais — legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf)
- [Guia de segurança da ANPD para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte)
