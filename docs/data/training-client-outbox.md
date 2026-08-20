# Persistência local e outbox do treino

Status: US-009A, US-009B1 e US-009B2a verificadas em staging. A jornada Expo da
US-009B2b também está implementada e passou no CI de staging; US-009 permanece
parcial somente até a prova física, ainda rastreada na
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
   anônimo;
9. hub de treinos disponível pelo snapshot local quando apenas os metadados de
   origem do plano estão indisponíveis.

## Modelo no app móvel

O schema SQLCipher v2 contém:

- `training_session_snapshots`, com um snapshot validado por UUID do titular;
- `training_outbox_operations`, com chave composta titular/operação, sequência
  causal única por titular, estado, tentativas e payload validado pelo mesmo
  contrato usado na web.

O repositório móvel implementa o contrato `TrainingSessionLocalStore`. Gravar
snapshot + operação, confirmar + substituir operações e adotar o estado
canônico são transações exclusivas. Alterações de retry/conflito ficam em
colunas próprias e prevalecem sobre o JSON original. Linhas inválidas não são
reproduzidas. Logout preserva os dados criptografados e o UUID impede que outra
conta os restaure.

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

### Fechamento da US-009B1 web/PWA

- commits funcionais `b497048`, `22c6763` e `7599280` promovidos somente para
  staging; produção permaneceu inalterada;
- CI `31926428420` aprovou qualidade, a migration corretiva, 420 asserções de
  banco, API e worker; CI `31927057937` revalidou a correção de navegação
  offline;
- Cloudflare Pages publicou o mesmo commit usado no smoke hospedado;
- início da sessão, início do exercício, primeira série e sua revisão foram
  gravados offline como quatro comandos pendentes com ordem causal;
- reload ainda offline restaurou sessão, série e cronômetro a partir dos
  instantes persistidos; a revisão local permaneceu em 11 kg × 11 repetições,
  revisão 2;
- reconexão zerou a outbox e preservou exatamente uma série canônica revisada;
- pausa e retomada offline entraram na fila na ordem correta, o cronômetro ficou
  congelado enquanto pausado e voltou a avançar depois da retomada;
- o primeiro smoke revelou que o hub ainda dependia dos metadados remotos da
  origem do plano. A dependência foi isolada: com plano local válido, o hub
  continua disponível offline;
- a execução sintética foi cancelada ao final e a inspeção confirmou outbox
  vazia e nenhum treino ativo.

### Fechamento da US-009B2a — persistência móvel

- commit funcional `6acc907` promovido somente para staging;
- CI de staging `31955501372` aprovada: quality gates, banco, API, worker e
  smoke público;
- Cloudflare Pages publicou o mesmo commit no deploy `d7ba3221`;
- 49 testes mobile e 187 testes no monorepo aprovados;
- exports Android, iOS e web do Expo concluídos pelo mesmo gate;
- schema SQLCipher v2, atomicidade, rollback, ordem causal, isolamento por UUID,
  conflito/retry e descarte seguro de linha inválida cobertos por teste;
- nenhuma migration remota foi adicionada e produção permaneceu inalterada.

### Implementação da US-009B2b — jornada móvel

- commit funcional `ad56772` promovido somente para staging;
- CI de staging `31957510838` aprovada: quality gates, 420 verificações de banco,
  API e worker;
- 55 testes mobile e 193 testes no monorepo aprovados;
- exports Android, iOS e web do Expo concluídos;
- login e retorno de sessão seguem para o hub de treinos;
- início, conclusão e correção/desfazer de série, pausa/retomada,
  cancelamento/finalização, sincronização manual e resolução de conflito usam o
  mesmo runtime local-first da web;
- conectividade nativa é observada pelo NetInfo, persistência Android/iOS usa
  SQLCipher e o export web do Expo usa IndexedDB;
- o cronômetro do treino é recalculado pelos timestamps persistidos, por isso o
  tempo continua correto ao reabrir o app e desconta pausas;
- produção permaneceu inalterada.

### COR-006 — relógios após suspensão ou encerramento

- o descanso ativo deixa de acumular callbacks de um segundo e passa a guardar
  `endsAt`, duração e identidades da execução no snapshot local isolado pelo UUID;
- bloquear a tela ou colocar o app em segundo plano não altera o prazo: ao voltar,
  o valor visível é recalculado pela diferença entre `endsAt` e o relógio atual;
- fechar e reabrir restaura um descanso ainda vigente; um prazo expirado é
  removido durante a leitura e não reabre a tela;
- a leitura e a substituição por estado canônico preservam o descanso local
  somente quando a sessão, a série concluída e o próximo exercício ainda são
  válidos;
- concluir o descanso remove o estado do snapshot, sem criar comando remoto;
- o tempo total do treino continua derivado de `startedAt`, `pausedAt` e
  `pausedDurationSeconds`, mas agora redesenha imediatamente em `focus`,
  `visibilitychange`, `pageshow` e no retorno ativo do app nativo.

Os testes automatizados cobrem retorno após 60 segundos sem callbacks, reabertura
com prazo vigente, expiração durante o encerramento, descarte manual e preservação
durante refresh canônico. A correção está rastreada na
[issue #42](https://github.com/jukazilli/daygymm/issues/42).

Aceite do owner em 20/08/2026: a correção publicada no commit `bce2f15` foi
aprovada após o teste em staging. A issue #42 foi encerrada; produção permanece
inalterada.

### Correção de abertura offline do PWA

- a sessão Supabase continua persistida, mas sua renovação deixa de bloquear o
  acesso ao snapshot local quando o navegador já está offline;
- um ponteiro local validado para o UUID do último titular desbloqueia somente o
  armazenamento local e é removido após logout confirmado;
- o checkpoint de `PlanSourceState` guarda apenas conclusão/origem do plano e
  não replica as respostas do onboarding;
- Home e Treinos priorizam plano ou execução já persistidos quando os metadados
  remotos de onboarding estão indisponíveis;
- `daygym-runtime-v2` antecipa `/hoje/`, `/treinos/`, `/treinos/sessao/`,
  `/comecar/` e `/entrar/`, além de apagar caches runtime obsoletos;
- primeira instalação ou primeira carga ainda exige rede para obter código e
  dados; depois disso não existe requisito de abrir online no mesmo dia.
- commits `af05afc`, `2ec03f5` e `b9fbe3c` promovidos somente para staging;
- CI `31963010689` verde, com qualidade, segurança, banco, API e worker;
- smoke hospedado confirmou `daygym-runtime-v2` e as cinco rotas críticas no
  cache; com rede bloqueada e `navigator.onLine` falso, `/comecar/` recuperou
  `/hoje/` e `/treinos/` exibiu `Meus treinos` em até 300 ms.

### Correção da agenda offline — issue #39

- a rota `/treinos/meus/`, onde a pessoa escolhe a sessão da agenda semanal,
  passa a integrar o app shell antecipado pelo service worker;
- `daygym-runtime-v3` prioriza um fallback da área de treinos para requisições
  sob `/treinos/`, evitando o redirecionamento silencioso para Home;
- ao abrir `sessao=<id>` sem rede, o runtime escolhe a sessão solicitada entre
  as sessões do plano persistido, mesmo quando o dia atual é de descanso;
- o selo permanente `Prévia` do cabeçalho foi removido. `Modo offline` aparece
  somente enquanto o navegador informa ausência de conectividade e desaparece
  automaticamente após a reconexão;
- a correção está rastreada na
  [issue #39](https://github.com/jukazilli/daygymm/issues/39), vinculada à
  US-009 e à prova física da issue #38.

Evidência hospedada em 16/08/2026: commits funcionais `0d96880` e `3b6c377`,
com documentação em `fab0170` e `ba7c3cc`, promovidos somente para staging. O
CI `31966544566` aprovou 206 testes e os demais gates. Em navegador novo, o
cache `daygym-runtime-v3` continha `/treinos/`, `/treinos/meus/` e
`/treinos/sessao/`. Com a rede bloqueada, a agenda exibiu seis sessões; uma
sessão de segunda-feira abriu mesmo no domingo e pôde ser iniciada, criando um
registro local pendente. A reconexão mudou o estado para `Sincronizado`; a
execução sintética foi cancelada ao final. `Modo offline` apareceu sem rede e
sumiu após a reconexão.

## Limites do corte seguinte

US-009B2b ainda deve executar o
[roteiro físico de 30 minutos](../runbooks/us-009b2-device-proof.md) sobre um
development build do commit `ad56772`, com dois fechamentos/reaberturas e zero
duplicação em pelo menos um aparelho. A segunda plataforma permanece no aceite
abrangente da FND-017. Adicionar tempo, vibração, substituição e resumo continuam
pertencendo à US-010; a persistência e a recomposição temporal do descanso foram
antecipadas pela COR-006.
