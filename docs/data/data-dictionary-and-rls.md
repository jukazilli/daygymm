# Dicionário de dados e matriz RLS

Status: baseline executável do `FND-011`, restrito ao schema implementado no M0.

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

## Matriz de acesso e RLS

`anon` não possui `USAGE` no schema `api`. `authenticated` recebe somente leitura
nas relações expostas, filtrada por `auth.uid()`. Operações de escrita passam pela
fronteira server-owned do trigger de Auth. O schema `private` não é exposto ao
cliente.

| Recurso                           | Papel                  |  SELECT | INSERT | UPDATE | DELETE | Política/controle                     | Teste negativo       |
| --------------------------------- | ---------------------- | ------: | -----: | -----: | -----: | ------------------------------------- | -------------------- |
| `api.profiles`                    | `anon`                 |     Não |    Não |    Não |    Não | sem `USAGE` em `api`                  | `RLS-N01`            |
| `api.profiles`                    | `authenticated`        | Próprio |    Não |    Não |    Não | `profiles_select_own`; grants mínimos | `RLS-N02`, `RLS-N05` |
| `api.profiles`                    | função interna         |     N/A |    Sim |    Não |    Não | trigger `SECURITY DEFINER`            | testes do cadastro   |
| `api.consents`                    | `anon`                 |     Não |    Não |    Não |    Não | sem `USAGE` em `api`                  | `RLS-N01`            |
| `api.consents`                    | `authenticated`        | Próprio |    Não |    Não |    Não | `consents_select_own`; grants mínimos | `RLS-N03`, `RLS-N06` |
| `api.consents`                    | função interna         |     N/A |    Sim |    Não |    Não | trigger `SECURITY DEFINER`            | testes do cadastro   |
| `private.legal_document_versions` | `anon`/`authenticated` |     Não |    Não |    Não |    Não | schema privado; grants revogados      | `RLS-N04`            |
| `private.legal_document_versions` | administração          |     Sim |    Sim |    Sim |    Sim | migration/operação privilegiada       | fora do cliente      |

As policies temporárias de inserção criadas na migration inicial foram removidas
pela migration seguinte. As únicas policies ativas são `profiles_select_own` e
`consents_select_own`. Os controles negativos estáveis são:

- `RLS-N01`: bloqueia acesso anônimo ao schema exposto;
- `RLS-N02`: bloqueia mutação direta de elegibilidade;
- `RLS-N03`: bloqueia mutação direta do histórico de aceitação;
- `RLS-N04`: bloqueia leitura do registro privado de versões;
- `RLS-N05`: prova isolamento entre perfis autenticados;
- `RLS-N06`: prova isolamento entre históricos autenticados.

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
