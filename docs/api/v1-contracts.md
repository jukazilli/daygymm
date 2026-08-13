# Contratos da API DayGym v1

Este runbook descreve como evoluir a fronteira HTTP e os eventos internos sem
criar uma segunda fonte de verdade. Os schemas executáveis vivem em
`packages/contracts`; a API e os consumidores importam o pacote público.

## Superfícies publicadas

- `GET /v1` comprova a versão e a política de compatibilidade ativa.
- `GET /v1/openapi.json` publica o documento OpenAPI 3.1 gerado dos mesmos
  schemas usados em runtime.
- `/health/live` e `/health/ready` permanecem fora de `/v1`, pois descrevem o
  processo, não um contrato de produto.

Os endpoints de sync, planos, profissional, nutrição, comunidade, rewards,
GdShop e conta só entram quando o slice do domínio possuir autorização,
idempotência, limites e testes próprios. Uma rota futura não é documentada como
implementada apenas por aparecer na arquitetura-alvo.

## Regras HTTP

1. Mudanças em `/v1` são aditivas. Remoção ou mudança semântica exige nova
   versão e janela explícita para o cliente mobile anterior.
2. Criação, commit, publicação e reward recebem `Idempotency-Key` entre 16 e
   128 caracteres. Retry repete a mesma chave.
3. Listas usam cursor opaco, ordem determinística e `limit` entre 1 e 100; o
   default compartilhado é 25.
4. O servidor gera `x-correlation-id`. O identificador aparece no Problem
   Details e pode ser informado ao suporte sem carregar conteúdo do usuário.
5. Erros usam `application/problem+json`. `type`, `code` e `status` são
   estáveis; `title` é seguro para apresentação. Stack, SQL, rota recebida,
   token, valor rejeitado e mensagem crua do provider não entram na resposta.

## Eventos internos v1

O envelope exige `event_id`, `event_name`, `event_version`, `occurred_at` UTC,
`correlation_id`, `producer` e `payload` mínimo. Os eventos aprovados são:

- `TrainingSessionCompleted`
- `PlanVersionPublished`
- `ProfessionalAccessRevoked`
- `RewardGranted`
- `ModerationCaseOpened`
- `PartnerOfferChanged`

Producer usa `serializeDomainEventV1`; consumer usa `parseDomainEventV1`.
Ambos passam pelo mesmo schema estrito. Campo novo deve ser aditivo e aprovado;
e-mail, nome, nota livre, treino detalhado, saúde, token e payload bruto de
provider não entram por conveniência.

Entrega futura será pelo menos uma vez. Cada consumer deverá registrar uma
chave idempotente e declarar se tolera reordenação antes de entrar na outbox.

## Verificação

1. Executar `pnpm --filter @daygym/contracts test`.
2. Executar `pnpm --filter @daygym/api test`.
3. Executar `pnpm check:ci` e `pnpm security`.
4. Em staging, confirmar `/v1`, `/v1/openapi.json`, content type de erro e
   `x-correlation-id` sem registrar valores sensíveis.
