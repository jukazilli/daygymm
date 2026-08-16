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
