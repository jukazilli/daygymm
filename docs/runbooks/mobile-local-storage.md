# Persistência local segura do mobile

Este runbook cobre a fundação local de FND-017. Ele registra nomes e
procedimentos, nunca valores de sessão ou material criptográfico.

## Contrato

1. A sessão Supabase e os verificadores PKCE usam exclusivamente o adapter
   `SecureSessionStorage`; AsyncStorage é proibido para autenticação.
2. O adapter divide valores grandes em itens pequenos do SecureStore e troca o
   ponteiro ativo somente depois de gravar todos os fragmentos e o manifesto.
   Falha de substituição preserva a última sessão completa.
3. A chave do banco é composta por 32 bytes gerados por `expo-crypto`, codificada
   como 64 caracteres hexadecimais e guardada no SecureStore com acesso apenas
   enquanto o dispositivo está desbloqueado e sem migração para outro device.
4. O driver aplica a raw key antes da primeira leitura, habilita limpeza de
   memória do SQLCipher e prova `PRAGMA cipher_version` e leitura de
   `sqlite_master` antes de migrations ou escrita.
5. Migrations são contíguas, executadas individualmente em transação exclusiva
   e registradas por `PRAGMA user_version`. Nenhum erro apaga ou recria o banco.

## Estados e diagnóstico

| Estado               | Significado                                                      | Ação operacional                                                                             |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `KEY_UNAVAILABLE`    | SecureStore falhou ou contém chave inválida.                     | Preservar banco; coletar somente código, plataforma e release; investigar Keychain/Keystore. |
| `CIPHER_UNAVAILABLE` | Biblioteca, chave ou leitura criptografada não pôde ser provada. | Bloquear escrita; confirmar development build com SQLCipher e integridade da chave.          |
| `MIGRATION_FAILED`   | Uma migration falhou ou há lacuna de versão.                     | Preservar arquivo; corrigir migration por forward-fix; nunca executar retry destrutivo.      |
| `SCHEMA_UNSUPPORTED` | O banco foi aberto por uma versão mais nova do app.              | Bloquear escrita e instalar cliente compatível; não executar downgrade destrutivo.           |

O diagnóstico não inclui e-mail, JWT, refresh token, chave do banco, SQL com
valor de usuário ou conteúdo de treino.

## Backup e recuperação

- Android declara `allowBackup=false`; o SecureStore também mantém regras de
  exclusão caso a política global mude no futuro. Isso impede restaurar um banco
  criptografado sem a chave do Android Keystore.
- iOS usa `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; restauração em outro aparelho não
  migra a chave. O comportamento final de backup e reinstalação precisa ser
  provado em device antes do beta.
- Logout remove os fragmentos da sessão. Retenção ou remoção do banco de treino
  será uma decisão explícita da jornada de logout; este corte não apaga dados.

## Verificação

1. Executar `pnpm check:mobile-storage`, testes mobile e gates globais.
2. Materializar CNG e confirmar `expo.sqlite.useSQLCipher=true`,
   `android:allowBackup="false"` e regras do SecureStore.
3. Em development build real, criar/reabrir banco, reiniciar app, trocar sessão,
   executar logout e provocar migration inválida sem perda do arquivo.
4. Repetir reinstalação e backup/restore em Android e iOS antes de fechar
   FND-017.

## Estado atual

A implementação, testes de contrato e materialização Android CNG estão
validados localmente. FND-017 permanece `In Progress` até existirem development
build EAS, teste em device e evidência de backup/reinstalação nas duas
plataformas.
