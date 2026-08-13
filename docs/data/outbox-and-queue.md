# Outbox transacional e fila de eventos

Status: fundação parcial executável do `FND-022`.

## Decisão e limite do corte

A dependência circular entre `FND-022` e `FND-024` foi removida. A ordem válida
é contratos e RLS (`FND-010`, `FND-012`), outbox/fila (`FND-022`) e somente
depois dashboards, SLOs e alertas (`FND-024`).

Este corte cria o mecanismo privado e prova deduplicação e despacho, mas não
marca `FND-022` como concluído. Ainda não existe um comando funcional de treino
que possa gravar estado canônico e evento na mesma transação, e o worker do
Cloud Run ainda não possui o acesso mínimo ao banco para consumir a fila.

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
2. O worker usa identidade/segredo mínimo e consome `domain_events`.
3. O consumidor prova repetição, timeout, reordenação permitida e arquivo após
   sucesso.
4. Idade, tentativas e dead-letter lógico alimentam `FND-024` sem payload
   sensível.

## Referências oficiais

- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Supabase Queues API](https://supabase.com/docs/guides/queues/api)
- [PGMQ](https://github.com/pgmq/pgmq)
