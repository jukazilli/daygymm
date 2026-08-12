# Exceções temporárias de dependência

## Expo Metro / `image-size`

- **Owner:** mantenedor do repositório (`jukazilli`), até a definição formal de ownership em FND-001.
- **Registrada em:** 12 de agosto de 2026.
- **Expira em:** 12 de setembro de 2026.
- **Advisories:** [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) e [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).

O Expo SDK 55, selecionado porque é a linha estável compatível com Node.js 22.12.0, traz `image-size@1.2.1` transitivamente no Metro. Os dois advisories são negação de serviço por loop infinito durante parsing de imagens ICNS, JXL ou HEIF. A auditoria atual não indica versão corrigida.

O risco fica temporariamente aceito apenas para o ambiente M0 porque:

1. O aplicativo não aceita, armazena ou processa imagens fornecidas por usuários nesta etapa.
2. O pacote é usado pelo bundler local/CI; não há serviço DayGym exposto que receba esses arquivos.
3. O gate automatizado continua bloqueando qualquer advisory novo de severidade alta ou crítica e bloqueia estas duas exceções após a data de expiração.

Antes do vencimento, o owner deve reavaliar uma atualização Expo/Metro com correção publicada. Sem renovação explícita com nova evidência, o CI volta a bloquear a branch.
