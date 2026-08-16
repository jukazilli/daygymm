# Persistência local e outbox do treino

Status: US-009A verificada em staging; US-009B1 implementada localmente para a
execução web/PWA e aguardando a prova hospedada. US-009 permanece parcial e
rastreada na
[issue #38](https://github.com/jukazilli/daygymm/issues/38).

## Contrato do corte

Início de sessão e exercício, conclusão e revisão de série, pausa, retomada,
cancelamento e finalização não dependem mais da disponibilidade da rede. Antes
de confirmar sucesso na interface, o cliente grava o snapshot atualizado e o
comando na mesma transação IndexedDB. Cada operação carrega identidade estável,
ordem causal e o instante real em que ocorreu. O replay nunca adianta um comando
sobre o anterior.

Conclusões usam `training-set:{run_id}:{item_id}:{set_number}`. Cancelamentos
gravam um recibo mínimo no servidor, de modo que a repetição após uma resposta
de rede perdida permaneça sucesso. Início, pausa, retomada e finalização usam os
instantes locais validados pelo servidor; sincronizar mais tarde não aumenta
artificialmente a duração do treino.

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
como conflito; nunca removem o snapshot otimista em silêncio. `Sincronização
bloqueada` abre uma decisão explícita: tentar novamente ou usar a versão online.
A segunda opção informa que descartará as alterações pendentes antes de
executá-la.

O service worker usa cache runtime do mesmo origin. Em cada rota visitada, a PWA
guarda o HTML estático e os assets versionados referenciados por ele. Navegações
usam rede primeiro e recorrem à cópia visitada quando a rede falha; assets com
hash usam cache primeiro. Respostas do Supabase e de qualquer outro origin não
entram nesse cache.

## Modelo no navegador

O banco `daygym-training-local`, versão 1, contém:

- `session-snapshots`: último estado válido da execução, isolado pelo UUID do
  usuário autenticado;
- `outbox-operations`: payload mínimo de `start-session`, `start-exercise`,
  `complete-set`, `revise-set`, `pause-session`, `resume-session`,
  `cancel-session` ou `finish-session`, com chave idempotente, ordem causal,
  tentativas, próxima tentativa e estado pendente/conflito.

Ao reabrir sem rede, a tela usa o snapshot somente quando consegue recuperar a
identidade da sessão persistida do Supabase. Nenhum e-mail, JWT ou segredo entra
no banco do treino.

Logout não apaga snapshot nem comandos pendentes. Os registros permanecem
isolados pelo UUID e só voltam a ser lidos quando o mesmo titular se autentica.
Essa decisão evita perda silenciosa ao sair da conta; uma futura limpeza local
deverá ser uma ação separada e explícita.

## Provas automatizadas

Os testes do gateway local-first cobrem:

1. duas séries confirmadas offline e recuperadas por uma nova instância;
2. replay único após reconexão;
3. início, exercício, pausa, retomada e cancelamento na ordem original;
4. revisão enfileirada que recebe o ID canônico da série precedente;
5. conflito preservado até a escolha explícita da versão online;
6. pendência preservada no logout e retomada pelo mesmo titular;
7. copy e ações de estado offline/conflito na tela de execução;
8. RPCs autenticados, timestamps validados e recibo de cancelamento sem acesso
   anônimo.

## Evidência hospedada — 16/08/2026

- commit funcional `cd6b486`; documentação/rastreabilidade `88aa648`;
- CI de staging `31923777514` aprovada, incluindo banco, API e worker;
- service worker ativo com `daygym-runtime-v1` e rota de sessão no cache;
- série 1 concluída com o contexto do navegador offline e confirmada como
  `Salvo neste aparelho`;
- reload ainda offline recuperou a execução em `Série 2 de 4`;
- inspeção do IndexedDB confirmou um snapshot e uma operação pendente;
- reconexão esvaziou a outbox; novo reload online manteve exatamente uma série
  canônica, sem duplicação;
- a execução sintética foi cancelada ao final do smoke.

## Limites do corte seguinte

US-009B2 ainda deve materializar o contrato nas tabelas SQLCipher do app Expo e
provar 30 minutos offline, fechamento/reabertura e zero duplicação em aparelho
físico. O estado do cronômetro de descanso continua pertencendo à US-010.
