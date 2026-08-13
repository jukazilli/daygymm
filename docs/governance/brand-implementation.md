# Implementação da marca DayGym

Status: contrato ativo de implementação
Atualizado em: 13/08/2026

Este registro traduz a direção de UI canônica privada em ativos e tokens que
podem ser versionados com as aplicações. A referência de energia visual não
autoriza reproduzir o logo ou a tipografia de outra empresa.

## Identidade

- Símbolo aprovado: um `D` maiúsculo original cuja haste vertical é uma barra
  de halter.
- Tratamento principal: símbolo branco sobre laranja luminoso sólido `#FF6B00`.
- O símbolo foi criado com geração de imagens da OpenAI, normalizado para a
  paleta sólida exata e exportado para contextos maskable e não maskable.
- Gradientes, brilhos, sombras e textura fotográfica ficam fora do sistema
  funcional da marca.
- O símbolo é usado no ícone do app, ícone PWA, splash e assinatura compacta do
  produto. Ele não deve virar um padrão decorativo repetido dentro das telas.

Ativos canônicos:

- Símbolo web: `apps/web/public/brand/daygym-mark.png`
- Ícones PWA: `apps/web/public/pwa/`
- Ativos do app nativo: `apps/mobile/assets/`

## Cor e contraste

A paleta versionada está em `packages/design-tokens/src/index.ts`. A escala da
marca oferece subtons claros e escuros, mantendo as superfícies majoritariamente
neutras. `brand.action` é `#FF6B00` no tema claro e `#FF8A3D` no tema escuro
preparado.

Laranja luminoso não oferece contraste suficiente com texto branco pequeno.
Controles primários usam, portanto, o ink escuro `actionContrast`. Branco
continua sendo a cor aprovada do símbolo sobre o campo laranja.

## Tipografia

Nunito é a família da interface web e mobile. Somente Regular 400, Medium 500,
SemiBold 600 e Bold 700 são carregadas. A escala aprovada de tamanho e altura de
linha permanece inalterada.

## Experiência de abertura

- PWA instalada: a superfície de abertura do sistema operacional é seguida por
  um splash DayGym curto, exibido apenas no modo standalone durante a hidratação.
- Builds nativos: `expo-splash-screen` renderiza o símbolo gerado no campo da
  marca; a aparência escura usa o canvas escuro preparado.
- Abas comuns do navegador não exibem o splash do aplicativo.

## Continuidade de sessão

A continuidade não usa um access token eterno. Web e mobile persistem a sessão
de refresh e rotacionam automaticamente access tokens de curta duração. No
nativo, o refresh fica no SecureStore. A sessão termina por logout explícito,
revogação ou invalidação de segurança do provedor.
