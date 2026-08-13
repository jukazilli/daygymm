# Dicionário de dados e matriz RLS

Status: baseline executável do `FND-011`, atualizado pelo comando transacional
de finalização do `FND-022` e pelo contexto progressivo da `US-003`.

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

Finalidade: persistir a confirmação canônica mínima de uma sessão concluída e a
identidade estável do evento correspondente. O corte não modela sets, timers,
notas ou o ciclo da sessão ativa; esses dados pertencem ao M1 e serão adicionados
sem reescrever uma finalização já confirmada.

| Campo                    | Tipo/restrição                              | Finalidade                                     | Classificação              | Retenção atual                                                               | Índice                                 |
| ------------------------ | ------------------------------------------- | ---------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `session_id`             | UUID, PK                                    | Identificar a sessão canônica                  | Identificador técnico      | Ciclo de vida da conta; política final no `FND-029`                          | PK                                     |
| `user_id`                | UUID, FK `api.profiles.user_id`, cascade    | Vincular a sessão ao titular                   | Identificador pessoal      | Removido em cascade com o perfil enquanto não houver decisão legal diferente | `training_sessions_user_completed_idx` |
| `operation_id`           | text, 16–128, formato técnico, unique/owner | Deduplicar replay do comando offline           | Identificador técnico      | Mesmo ciclo da sessão                                                        | Unique composto                        |
| `completed_at`           | timestamptz, obrigatório                    | Registrar o instante declarado da finalização  | Dado de atividade sensível | Mesmo ciclo da sessão                                                        | `training_sessions_user_completed_idx` |
| `version`                | integer positivo                            | Controlar a versão canônica da sessão          | Metadado técnico           | Mesmo ciclo da sessão                                                        | Não                                    |
| `completion_event_id`    | UUID, unique                                | Fixar o evento emitido na primeira finalização | Identificador técnico      | Mesmo ciclo da sessão/evento                                                 | Unique                                 |
| `completion_consumed_at` | timestamptz, opcional                       | Confirmar aplicação idempotente do handler     | Metadado operacional       | Mesmo ciclo da sessão                                                        | Não                                    |
| `created_at`             | timestamptz, obrigatório                    | Registrar a persistência no servidor           | Metadado operacional       | Mesmo ciclo da sessão                                                        | Não                                    |

### `api.onboarding_contexts`

Owner: usuário autenticado, limitado por grants de coluna, RLS e pela função
`api.save_onboarding_context()` executada como invoker.

Finalidade: salvar e retomar apenas o contexto mínimo usado para escolher o
caminho do plano: objetivo, experiência comportamental, frequência, duração,
equipamentos e estado amplo de limitação. Não armazena peso, diagnóstico,
descrição clínica ou texto livre.

| Campo               | Tipo/restrição                                  | Finalidade                                      | Classificação              | Retenção atual                                                               | Índice |
| ------------------- | ----------------------------------------------- | ----------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- | ------ |
| `user_id`           | UUID, PK, FK `api.profiles.user_id`, cascade    | Vincular o contexto ao titular                  | Identificador pessoal      | Removido em cascade com o perfil enquanto não houver decisão legal diferente | PK     |
| `goal`              | text opcional, allowlist                        | Registrar o objetivo principal                  | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `experience`        | text opcional, allowlist comportamental         | Adequar linguagem e caminho do plano            | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `weekly_days`       | smallint opcional, entre 2 e 5                  | Registrar frequência sustentável                | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `session_minutes`   | smallint opcional, 30/45/60/75                  | Registrar tempo disponível                      | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `equipment_context` | text opcional, allowlist                        | Limitar o plano ao ambiente disponível          | Preferência de treino      | Mesmo ciclo do contexto                                                      | Não    |
| `limitation_status` | text opcional, allowlist sem detalhe clínico    | Direcionar revisão profissional quando indicada | Dado de atividade sensível | Mesmo ciclo do contexto                                                      | Não    |
| `current_step`      | smallint, entre 0 e 6, progresso coerente       | Retomar sem repetir respostas                   | Metadado de uso            | Mesmo ciclo do contexto                                                      | Não    |
| `completed_at`      | timestamptz opcional, normalizado pelo servidor | Registrar confirmação explícita                 | Metadado de uso            | Mesmo ciclo do contexto                                                      | Não    |
| `updated_at`        | timestamptz, normalizado pelo servidor          | Registrar a última atualização                  | Metadado operacional       | Mesmo ciclo do contexto                                                      | Não    |

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

| Recurso                           | Papel                  |  SELECT |  INSERT |  UPDATE | DELETE | Política/controle                                                                                                                    | Teste negativo       |
| --------------------------------- | ---------------------- | ------: | ------: | ------: | -----: | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `api.profiles`                    | `anon`                 |     Não |     Não |     Não |    Não | sem `USAGE` em `api`                                                                                                                 | `RLS-N01`            |
| `api.profiles`                    | `authenticated`        | Próprio |     Não |     Não |    Não | `profiles_select_own`; grants mínimos                                                                                                | `RLS-N02`, `RLS-N05` |
| `api.profiles`                    | função interna         |     N/A |     Sim |     Não |    Não | trigger `SECURITY DEFINER`                                                                                                           | testes do cadastro   |
| `api.consents`                    | `anon`                 |     Não |     Não |     Não |    Não | sem `USAGE` em `api`                                                                                                                 | `RLS-N01`            |
| `api.consents`                    | `authenticated`        | Próprio |     Não |     Não |    Não | `consents_select_own`; grants mínimos                                                                                                | `RLS-N03`, `RLS-N06` |
| `api.consents`                    | função interna         |     N/A |     Sim |     Não |    Não | trigger `SECURITY DEFINER`                                                                                                           | testes do cadastro   |
| `private.legal_document_versions` | `anon`/`authenticated` |     Não |     Não |     Não |    Não | schema privado; grants revogados                                                                                                     | `RLS-N04`            |
| `private.legal_document_versions` | administração          |     Sim |     Sim |     Sim |    Sim | migration/operação privilegiada                                                                                                      | fora do cliente      |
| `platform.job_outbox`             | `anon`/`authenticated` |     Não |     Não |     Não |    Não | schema interno; grants revogados                                                                                                     | `RLS-N07`            |
| `platform.job_outbox`             | funções internas       |     Sim |     Sim |     Sim |    Não | definer boundary e fila privada                                                                                                      | testes do outbox     |
| `platform.job_outbox`             | worker runtime         |     Não |     Não |     Não |    Não | apenas wrappers privados bounded                                                                                                     | `RLS-N08`            |
| `api.training_sessions`           | `anon`                 |     Não |     Não |     Não |    Não | sem `USAGE` em `api`                                                                                                                 | `RLS-N01`            |
| `api.training_sessions`           | `authenticated`        | Próprio |     Não |     Não |    Não | `training_sessions_select_own`; grants mínimos                                                                                       | `RLS-N09`            |
| `api.training_sessions`           | função interna         |     Sim |     Sim |     Não |    Não | comando transacional server-owned                                                                                                    | testes do comando    |
| `api.onboarding_contexts`         | `anon`                 |     Não |     Não |     Não |    Não | sem `USAGE` em `api`                                                                                                                 | `RLS-N01`            |
| `api.onboarding_contexts`         | `authenticated`        | Próprio | Próprio | Próprio |    Não | `onboarding_contexts_select_own`, `onboarding_contexts_insert_own`, `onboarding_contexts_update_own`; constraints e grants de coluna | `RLS-N11`, `RLS-N12` |
| `platform.domain_event_receipts`  | `anon`/`authenticated` |     Não |     Não |     Não |    Não | schema interno; grants revogados                                                                                                     | `RLS-N10`            |
| `platform.domain_event_receipts`  | worker runtime         |     Não |     Não |     Não |    Não | somente router privado bounded                                                                                                       | `RLS-N10`            |
| `platform.domain_event_receipts`  | handler interno        |     Sim |     Sim |     Não |    Não | definer boundary sem payload                                                                                                         | testes do handler    |

As policies temporárias de inserção da fundação foram removidas pela migration
seguinte. As policies ativas são `profiles_select_own`, `consents_select_own`,
`training_sessions_select_own`, `onboarding_contexts_select_own`,
`onboarding_contexts_insert_own` e `onboarding_contexts_update_own`. Os controles
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
