# Design QA — fluxos focados do DayGym

- Source visual truth path: screenshots do Nubank e do editor DayGym anexados pelo owner nesta conversa; não há caminho local disponível.
- Implementation screenshot path: indisponível nesta execução.
- Viewport alvo: mobile, aproximadamente 393 × 852 CSS px.
- Source pixels: não mensurados porque o anexo da conversa não possui arquivo local exposto.
- Implementation pixels: não capturados.
- Density normalization: não aplicável sem os dois artefatos locais.
- State: editor de plano, importador, onboarding, hub de Treinos e execução por série com descanso focado.

**Full-view comparison evidence**

Bloqueada: conforme a preferência de validação manual do owner, nenhum navegador foi escolhido para esta execução e não foi feita captura renderizada.

**Focused region comparison evidence**

Bloqueada pelo mesmo motivo. As regiões que precisam de aceite manual são: chevron opaco e fixo, ausência de logo e selo `Prévia`, CTA fixo sobre o conteúdo, safe areas, inputs de carga/repetições empilhados, seleção de série em tela cheia e cronômetro de descanso.

**Findings**

- [P2] Falta evidência visual renderizada para comparar espaçamento, sobreposição, tipografia, cores e comportamento com teclado.
  - Impacto: lint, tipos e testes estruturais não comprovam fidelidade visual nem ausência de colisão em um iPhone real.
  - Correção: executar o roteiro manual em staging e anexar capturas nos mesmos estados e viewport da referência.

**Comparison history**

- Iteração 1: implementação estrutural concluída; comparação visual não iniciada porque não há navegador escolhido nem screenshot renderizado.
- Iteração 2: execução simplificada; histórico saiu do exercício, correção ganhou fluxo progressivo e descanso passou a ocupar uma tela focada. Aceite visual permanece manual em staging.

**Implementation checklist**

- Conferir fonte Nunito, pesos e quebras de linha.
- Conferir margens laterais, safe areas e ritmo vertical.
- Conferir contraste dos tokens laranja, branco e texto secundário.
- Conferir ícones Lucide e ausência de emoji ou lápis.
- Conferir textos dos CTAs e do tutorial.
- Conferir se carga e repetições mantêm a mesma largura útil sem compressão.
- Conferir o fluxo `Ajustar ou desfazer → escolher série → continuar → salvar`.
- Conferir o descanso em tela cheia, contagem regressiva e saída antecipada.

final result: blocked
