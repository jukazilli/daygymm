# Design QA — fluxos focados do DayGym

- Source visual truth path: screenshots do Nubank e do editor DayGym anexados pelo owner nesta conversa; não há caminho local disponível.
- Implementation screenshot path: indisponível nesta execução.
- Viewport alvo: mobile, aproximadamente 393 × 852 CSS px.
- Source pixels: não mensurados porque o anexo da conversa não possui arquivo local exposto.
- Implementation pixels: não capturados.
- Density normalization: não aplicável sem os dois artefatos locais.
- State: editor de plano, importador, onboarding, hub de Treinos e execução por série com descanso focado.

**Full-view comparison evidence**

O owner concluiu o teste manual em staging e aceitou funcionalmente a US-008 em 16/08/2026. Não foi anexada captura renderizada comparável; essa lacuna visual permanece como refinamento P2 e não bloqueia mais o fechamento funcional da história.

**Focused region comparison evidence**

Aceite funcional informado pelo owner. Uma futura rodada visual ainda deve comparar: chevron opaco e fixo, ausência de logo e selo `Prévia`, CTA fixo sobre o conteúdo, safe areas, inputs de carga/repetições empilhados, seleção de série em tela cheia e cronômetro de descanso.

**Findings**

- [P2] Falta evidência visual renderizada para comparar espaçamento, sobreposição, tipografia, cores e comportamento com teclado.
  - Impacto: lint, tipos e testes estruturais não comprovam fidelidade visual nem ausência de colisão em um iPhone real.
  - Correção: executar o roteiro manual em staging e anexar capturas nos mesmos estados e viewport da referência.

**Comparison history**

- Iteração 1: implementação estrutural concluída; comparação visual não iniciada porque não há navegador escolhido nem screenshot renderizado.
- Iteração 2: execução simplificada; histórico saiu do exercício, correção ganhou fluxo progressivo e descanso passou a ocupar uma tela focada. Aceite visual permanece manual em staging.
- Iteração 3: owner testou e aceitou funcionalmente a US-008 em staging. Melhorias adicionais de UI/UX foram adiadas como refinamento P2, sem reabrir a história.

**Implementation checklist**

- Conferir fonte Nunito, pesos e quebras de linha.
- Conferir margens laterais, safe areas e ritmo vertical.
- Conferir contraste dos tokens laranja, branco e texto secundário.
- Conferir ícones Lucide e ausência de emoji ou lápis.
- Conferir textos dos CTAs e do tutorial.
- Conferir se carga e repetições mantêm a mesma largura útil sem compressão.
- Conferir o fluxo `Ajustar ou desfazer → escolher série → continuar → salvar`.
- Conferir o descanso em tela cheia, contagem regressiva e saída antecipada.

final result: US-008 accepted; non-blocking P2 visual follow-up

## US-009A — estado local e sincronização

- A top bar preserva o mesmo espaço do estado anterior e agora diferencia
  `Sincronizado`, `Salvo neste aparelho`, `Sincronização pendente`,
  `Sincronizando…` e `Sincronização bloqueada`.
- Quando há fila recuperável, o próprio status é o controle de tentativa manual;
  não foi adicionado banner, tutorial ou texto explicativo ao fluxo imersivo.
- O feedback não depende apenas de cor: cada estado tem texto, e o controle
  pendente possui nome acessível com a quantidade de registros.
- O smoke hospedado em navegador real confirmou os estados `Offline`,
  `Salvo neste aparelho`, `Sincronização pendente` e `Sincronizado`, inclusive
  após reload offline. Evidência visual em dispositivo físico ainda é necessária
  para o aceite final da história.

final result: US-009A verified in staging; US-009B and physical-device acceptance pending

## US-009B1 — ciclo completo offline na web/PWA

- O status bloqueado abre somente as duas decisões necessárias: tentar novamente
  ou usar a versão online, avisando antes do descarte das alterações pendentes.
- Início, correção, pausa e retomada mantêm a interface de execução existente;
  nenhum banner ou tutorial foi acrescentado ao fluxo.
- O smoke hospedado encontrou um erro de navegação ao pausar offline: o hub
  dependia dos metadados remotos de origem do plano. Com um plano válido no
  snapshot, o hub agora continua acessível mesmo que esses metadados não
  respondam.
- A inspeção em viewport de desktop confirmou estados e comportamento, mas a
  comparação visual em iPhone permanece na prova física da US-009B2.

final result: US-009B1 verified in staging; physical-device visual evidence pending

## US-009B2b — jornada Expo local-first

- Login e sessão recuperada abrem diretamente o hub de treinos; `Minha conta`
  continua disponível como ação secundária.
- A execução móvel preserva os controles essenciais: iniciar exercício,
  registrar ou ajustar a última série, pausar, retomar, concluir e cancelar.
- O estado de sincronização permanece compacto no cabeçalho e usa linguagem do
  produto: `Salvo neste aparelho`, `Sincronização pendente`, `Sincronizando…` e
  `Sincronização bloqueada`.
- Conflito apresenta somente as duas decisões necessárias: tentar novamente ou
  adotar a versão online, com confirmação antes de descartar mudanças locais.
- O tempo de treino deriva dos timestamps persistidos e não depende de a tela
  permanecer aberta. O cronômetro de descanso continua fora deste corte.
- Android, iOS e web foram empacotados pelo CI `31957510838`; a validação visual
  e de comportamento após dois encerramentos do processo permanece no roteiro
  físico da US-009B2b.

final result: mobile journey implemented in staging; physical-device proof pending

## US-009B1 — cold open offline do PWA

- O erro `Não foi possível carregar suas respostas` vinha da rota `/comecar/`,
  que consultava onboarding remoto antes de considerar o plano IndexedDB.
- A abertura offline agora recupera o titular e o checkpoint mínimo locais;
  plano ou treino ativo têm precedência sobre metadados de origem indisponíveis.
- O estado sem rede só pede conexão quando a configuração realmente nunca foi
  concluída; usuários com treino salvo seguem para Home.
- O app shell guarda antecipadamente Home, Treinos, Sessão, Onboarding e Login,
  sem exigir que cada rota tenha sido visitada manualmente.
- O primeiro carregamento da versão continua necessariamente online; reaberturas
  posteriores podem começar já em modo avião.

- Evidência hospedada em Chromium: após login e carga única online, o cache
  continha as cinco rotas críticas. Com rede bloqueada e `navigator.onLine`
  falso desde a navegação, `/comecar/` abriu `/hoje/` e `/treinos/` exibiu
  `Meus treinos`, ambos em até 300 ms e sem o erro antigo.

final result: cold-open offline verified in staging; 30-minute physical proof pending

## US-009B1 — agenda e sinalização offline

- O selo permanente `Prévia` foi removido do cabeçalho do produto.
- `Modo offline` ocupa esse ponto apenas durante a indisponibilidade da rede e
  desaparece automaticamente na reconexão; não foi adicionado banner ou texto
  explicativo redundante.
- `Meus treinos` integra o app shell offline para manter a sequência
  `Treinos → Meus treinos → escolher sessão → iniciar` sem retorno indevido à
  Home. A sessão escolhida também é resolvida pelo plano local quando o treino
  do dia não existe.
- O smoke hospedado confirmou `Modo offline` no shell, seis sessões na agenda,
  abertura e início da sessão escolhida sem rede e remoção do aviso após a
  reconexão. A validação do owner permanece rastreada na issue #39.

final result: offline agenda correction verified in staging; owner verification pending

## US-010A — descanso ajustável e resumo essencial

- Viewport inspecionado: Chromium em 390 × 844 CSS px, equivalente ao alvo
  mobile estreito da direção de UI.
- O descanso usa bottom sheet com fundo atenuado, drag handle, contador dominante
  e somente as decisões do contexto: concluir, acrescentar 30 segundos, minimizar
  e, quando suportado, vibrar ao terminar.
- Minimizar devolve foco a um controle compacto no alcance do polegar e mantém a
  série atual visível; reabrir devolve foco ao cabeçalho do diálogo.
- O resumo final usa uma lista semântica de métricas, sem um card para cada dado:
  duração e aderência dominam; volume, tempo e distância aparecem apenas quando
  existem registros confirmados.
- A inspeção encontrou uma célula vazia quando havia quantidade ímpar de
  métricas. A última métrica passou a ocupar a largura inteira; o rótulo visual
  do ajuste também foi encurtado para `+30 s`, preservando o nome acessível.
- Snapshot acessível confirmou `dialog`, título, botões nomeados, foco inicial e
  retorno de foco. O console terminou com zero erros e zero avisos da aplicação.
- Vibração continua dependente do navegador e de ativação do usuário; a tela
  não promete esse recurso quando a API não existe.

final result: local mobile viewport verified; staging and owner acceptance pending

## Refinamento US-008 — execução focada por exercício

- Referência: telas Nubank e mockups enviados pelo owner nesta conversa; o
  objetivo transplantado foi hierarquia e baixa densidade, sem copiar marca ou
  alterar contratos do domínio.
- Viewports inspecionados: Chromium em 390 × 844 e 320 × 568 CSS px.
- A execução ativa ocupa uma única superfície laranja-clara em tela cheia, sem
  card externo, borda ou recuo lateral duplicado. Tempo total, nome do treino e
  contagens duplicadas foram removidos; a top bar mantém apenas voltar e um
  ponto de sincronização verde, laranja ou vermelho com nome acessível.
- Antes do play, a tela apresenta nome, série, meta, play e `Pular por agora`.
  Depois do play, o centro muda para o placeholder `Executando agora…` e mostra
  somente `Concluir série` e `Pular por agora`.
- Carga, repetições, duração, distância, referência anterior e orientação foram
  movidas para um bottom sheet aberto por `Concluir série`; o primeiro campo
  recebe foco e `Salvar série` mantém o início automático do descanso.
- A lista e as setas visíveis foram removidas. O primeiro treino com mais de um
  exercício ensina o swipe em um popup exibido uma única vez; teclado mantém as
  setas esquerda/direita como alternativa, descritas no próprio card.
- `Pular por agora` somente navega para outro exercício pendente. Não grava um
  estado fictício de conclusão, não altera o plano e permite retornar depois.
- Correção/desfazer aparece apenas quando existe série registrada e continua em
  fluxo progressivo separado.
- A barra de progresso foi integrada ao topo da superfície e representa
  séries confirmadas, sem repetir `0 de N` e `1 de N` na tela.
- Comparação visual local: o canvas contínuo eliminou a aparência de caixa
  espremida e ampliou a largura útil; os dois CTAs cabem inclusive em 320 × 568;
  o bottom sheet preserva rolagem para teclado virtual. Console da aplicação
  sem erros ou avisos.
- Prova automatizada: 12 cenários da tela, incluindo tutorial, swipe, fallback
  por teclado, ausência de setas visíveis, pulo sem mutação, confirmação,
  descanso após background, offline e correção.

final result: local mobile viewport verified; staging and owner acceptance pending
