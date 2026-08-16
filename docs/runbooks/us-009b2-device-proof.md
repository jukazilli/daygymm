# Prova da US-009B2 em aparelho físico

Status: roteiro pronto; execução pendente de development build e da jornada de
treino móvel conectada ao gateway local-first.

## Objetivo

Provar em aparelho real que uma execução de 30 minutos sobrevive sem rede e ao
encerramento do processo, sincroniza na ordem original ao reconectar e não cria
série, revisão, sessão ou evento duplicado.

## Pré-condições

1. Usar somente staging e conta sintética autorizada.
2. Instalar development build gerado do commit candidato, nunca Expo Go:
   SQLCipher exige código nativo próprio.
3. Confirmar `PRAGMA cipher_version` sem registrar chave, sessão ou conteúdo de
   treino.
4. Confirmar schema local v2 e as tabelas `training_session_snapshots` e
   `training_outbox_operations`.
5. Garantir bateria suficiente e desativar qualquer VPN que altere o teste de
   conectividade.

## Execução de 30 minutos

1. Entre online, abra um treino sintético e registre o horário inicial.
2. Ative modo avião e inicie a sessão e o primeiro exercício.
3. Conclua uma série, corrija-a e confirme o estado salvo no aparelho.
4. Pause e retome ainda offline; o tempo pausado não pode entrar na duração.
5. Aos 10 minutos, force o encerramento do app pelo seletor do sistema.
6. Reabra ainda em modo avião. A mesma sessão, série corrigida, revisão e tempo
   efetivo devem reaparecer.
7. Continue registrando séries até completar pelo menos 30 minutos desde o
   início. Inclua mais um fechamento/reabertura após os 20 minutos.
8. Desative modo avião e aguarde `Sincronizado` sem repetir nenhuma ação.
9. Feche e reabra online. O snapshot canônico deve continuar igual e a outbox
   deve estar vazia.
10. Finalize ou cancele a execução sintética conforme o roteiro de limpeza.

## Evidência obrigatória

- plataforma, modelo, versão do sistema e versão do app;
- commit e identificador do development build;
- horários de início, pausas, encerramentos, reaberturas e reconexão;
- contagem e tipos de comandos antes da reconexão e outbox zero depois dela;
- IDs canônicos e contagem de séries/revisões antes e depois de novo reload;
- duração calculada pelos timestamps originais, excluindo pausas;
- captura dos estados `Salvo neste aparelho`, `Pausado`,
  `Sincronização pendente` e `Sincronizado`;
- confirmação de que nenhum JWT, e-mail, chave ou payload sensível entrou em
  captura ou log.

## Critério de fechamento

US-009B2b só pode ser marcada `FECHADA` quando todos os passos passarem em pelo
menos um aparelho físico, sem perda, reordenação ou duplicação. A segunda
plataforma continua obrigatória para fechar a prova abrangente da FND-017.
Emulador, teste unitário, export web ou documentação não substituem essa prova.
