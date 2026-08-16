# Persistência local e outbox do treino

Status: US-009A implementada para a execução web/PWA; US-009 permanece parcial.

## Contrato do corte

A conclusão de uma série não depende mais da disponibilidade da rede. Antes de
confirmar sucesso na interface, o cliente grava o snapshot atualizado da sessão
e o comando `complete-set` na mesma transação IndexedDB. A operação usa a chave
estável `training-set:{run_id}:{item_id}:{set_number}`, já deduplicada pelo RPC
canônico.

O estado visível da top bar deriva da outbox local:

| Estado                    | Significado                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `Sincronizado`            | Não há comando local pendente.                                    |
| `Salvo neste aparelho`    | O registro está persistido localmente e a rede está indisponível. |
| `Sincronização pendente`  | Há registro local aguardando nova tentativa.                      |
| `Sincronizando…`          | O replay ordenado está em andamento.                              |
| `Sincronização bloqueada` | O servidor rejeitou o comando; o dado local não foi apagado.      |

O status pendente é um botão e permite tentativa manual. A volta da conexão
também dispara o replay. Falhas transitórias usam backoff exponencial com jitter
e teto de cinco minutos. Falhas sem recuperação automática preservam a operação
como conflito; nunca removem o snapshot otimista em silêncio.

O service worker usa cache runtime do mesmo origin. Em cada rota visitada, a PWA
guarda o HTML estático e os assets versionados referenciados por ele. Navegações
usam rede primeiro e recorrem à cópia visitada quando a rede falha; assets com
hash usam cache primeiro. Respostas do Supabase e de qualquer outro origin não
entram nesse cache.

## Modelo no navegador

O banco `daygym-training-local`, versão 1, contém:

- `session-snapshots`: último estado válido da execução, isolado pelo UUID do
  usuário autenticado;
- `outbox-operations`: payload mínimo da conclusão, chave idempotente, ordem
  causal, tentativas, próxima tentativa e estado pendente/conflito.

Ao reabrir sem rede, a tela usa o snapshot somente quando consegue recuperar a
identidade da sessão persistida do Supabase. Nenhum e-mail, JWT ou segredo entra
no banco do treino.

## Provas automatizadas

Os testes do gateway local-first cobrem:

1. duas séries confirmadas offline e recuperadas por uma nova instância do app;
2. reconexão e repetição do sync sem segunda chamada ao servidor;
3. substituição do ID otimista pelo ID canônico após confirmação;
4. falha transitória preservada e concluída por tentativa manual;
5. conflito preservado e exposto como estado visível;
6. copy e ação de `Salvo neste aparelho` na tela de execução.

O gate hospedado ainda precisa provar que a rota de execução já visitada abre
sem rede e lê o snapshot IndexedDB depois de fechar/reabrir o navegador.

## Limites do corte seguinte

US-009B ainda deve tornar início, pausa/retomada, correção, cancelamento e
finalização operações local-first; criar recuperação orientada para conflitos;
e materializar o mesmo contrato nas tabelas SQLCipher do app Expo. O estado do
cronômetro de descanso continua pertencendo à US-010. A política de retenção do
snapshot após logout também precisa de decisão explícita antes de fechar a
história.
