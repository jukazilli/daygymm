# Outbox transacional e fila de eventos

Status: fundação parcial executável do `FND-022`.

## Decisão e limite do corte

A dependência circular entre `FND-022` e `FND-024` foi removida. A ordem válida
é contratos e RLS (`FND-010`, `FND-012`), outbox/fila (`FND-022`) e somente
depois dashboards, SLOs e alertas (`FND-024`).

Este corte cria o mecanismo privado e prova deduplicação e despacho, mas não
marca `FND-022` como concluído. Ainda não existe um comando funcional de treino
que possa gravar estado canônico e evento na mesma transação. O worker do Cloud
Run já possui credencial e acesso mínimo ao banco, mas o ciclo ainda não é
ativado sem handlers funcionais para os eventos aprovados.

O contrato de aplicação em `apps/api/src/domain-event-consumer.ts` valida o
envelope compartilhado, exige um handler `handleOnce` idempotente e arquiva a
mensagem somente depois de sucesso. Ele ainda não é o adaptador do PGMQ nem
autoriza acesso privilegiado do runtime ao banco.

O segundo subcorte adiciona o adaptador PostgreSQL em
`apps/api/src/worker-queue.ts`, o ciclo bounded em
`apps/api/src/domain-event-worker.ts` e a identidade exclusiva
`daygym_worker_runtime`. A credencial é montada como arquivo pelo Secret Manager;
a URL administrativa de migrations nunca é reutilizada no container.

## Contrato executável

- `platform.job_outbox` aceita somente os seis eventos v1 declarados em
  `@daygym/contracts`;
- `private.enqueue_domain_event(jsonb)` rejeita envelopes desconhecidos e
  deduplica replay idêntico por `event_id`;
- reutilizar o mesmo `event_id` com conteúdo diferente falha fechado;
- `private.dispatch_domain_events(integer)` bloqueia linhas com
  `FOR UPDATE SKIP LOCKED`, publica em `pgmq` e marca o outbox na mesma transação;
- a fila durável privada se chama `domain_events`;
- `anon` e `authenticated` não possuem acesso aos schemas `platform`, `private`
  ou `pgmq` nem aos payloads da fila;
- mensagens futuras só podem ser arquivadas pelo consumidor depois do efeito
  concluído com idempotência própria.
- falhas de validação, processamento ou arquivo usam apenas códigos estáveis;
  detalhes de payload e segredos dos adaptadores não integram o erro retornado.
- o worker não possui acesso direto ao schema `pgmq`, ao outbox ou ao enqueue;
  executa somente wrappers privados bounded de dispatch, read e archive;
- a migration cria o login sem senha; a rotação segura ocorre pelo comando
  `pnpm db:provision:worker:staging`, que grava uma nova versão diretamente no
  Secret Manager sem imprimir o valor.

## Semântica operacional

A entrega é pelo menos uma vez entre fila e consumidor. A visibilidade do pgmq
evita processamento simultâneo dentro da janela, mas não substitui a chave
idempotente do consumidor. Falha antes do commit deixa o evento pendente; falha
depois da leitura e antes do arquivo torna a mensagem visível novamente.

Payload, erro e telemetria obedecem allowlist. O outbox não armazena e-mail,
token, texto livre ou dados de saúde neste corte. Retenção, arquivo e expurgo
definitivos serão fechados no `FND-029` antes de dados reais.

## Critérios para concluir `FND-022`

1. Um comando funcional grava estado e chama o enqueue na mesma transação.
2. Identidade, segredo e adaptador mínimos já existem; falta ativar e observar o
   ciclo no Cloud Run consumindo `domain_events` com um handler funcional.
3. O consumidor prova repetição, arquivo após sucesso e visibility timeout
   bounded; ainda precisa provar reordenação permitida com o handler real.
4. Idade, tentativas e dead-letter lógico alimentam `FND-024` sem payload
   sensível.

O item 2 permanece parcial até o ciclo ser ativado e observado no Cloud Run.
Polling agendado não é habilitado antes de handlers funcionais: ler uma fila de
trabalho sem conseguir executar todos os efeitos poderia aumentar tentativas ou
arquivar incorretamente mensagens futuras.

## Referências oficiais

- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Supabase Queues API](https://supabase.com/docs/guides/queues/api)
- [PGMQ](https://github.com/pgmq/pgmq)
