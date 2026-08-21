# Teste interno do DayGym no Android

## Objetivo

Gerar e instalar um APK nativo autônomo ligado exclusivamente ao staging para
testes em aparelho físico enquanto a emissão de credenciais iOS está bloqueada
pela verificação de identidade da Apple.

## Contrato do build

- Projeto EAS: `@soberania-tech/daygym`.
- Perfil: `preview`.
- Variante: `preview`.
- Pacote: `com.daygym.mobile.preview`.
- Artefato: APK de distribuição interna.
- Ambiente: somente variáveis públicas do staging no ambiente EAS `preview`.
- Produção e Google Play Console permanecem fora deste corte.

O perfil `preview` é nativo e inclui SQLCipher, SecureStore e NetInfo. Ele não é
Expo Go e não precisa de Metro após a instalação.

## Candidato atual

- Commit: `71572f8814254453358d398664a7f879c3380eff`.
- Build EAS: `ffbaec61-aeca-4fbb-a90b-292cb8f122a2`.
- Resultado remoto: `FINISHED` em 20 de agosto de 2026.
- Instalação interna:
  `https://expo.dev/accounts/soberania-tech/projects/daygym/builds/ffbaec61-aeca-4fbb-a90b-292cb8f122a2`.

Esse candidato está liberado para a prova em Android físico. O build bem-sucedido
não substitui o smoke nem a prova de 30 minutos deste runbook.

## Gerar

Na raiz do repositório:

```powershell
pnpm exec eas build --platform android --profile preview
```

Na primeira execução, permitir que o EAS gere e armazene a keystore Android. Não
baixar, copiar ou versionar a chave. Registrar o commit, o build ID e a URL da
página do build, sem registrar valores de ambiente.

O app depende de pacotes TypeScript internos compilados. O `postinstall` do
mobile executa `build:workspace-deps` antes do bundle remoto; não remover esse
hook. Sem ele, o Metro do EAS não encontra `packages/contracts/dist/index.js`
nem `packages/training-runtime/dist/index.js`, embora o export local possa
passar depois de uma compilação anterior.

## Instalar no aparelho

1. Abrir no Android o link ou QR code de instalação exibido na página do build.
2. Baixar o APK.
3. Quando o Android solicitar, autorizar temporariamente a instalação de apps
   desconhecidos somente para o navegador usado.
4. Instalar e confirmar que o nome exibido é `DayGym Preview`.
5. Revogar a permissão de instalar apps desconhecidos após a instalação.
6. Entrar somente com uma conta sintética autorizada de staging.

A URL interna permite baixar o APK e deve ser compartilhada somente com quem
participa do teste. Não publicar o link em issue pública, commit ou captura.

## Smoke mínimo

1. Abrir o app após instalação limpa e confirmar que não fecha no bootstrap.
2. Entrar, fechar o processo e reabrir; a sessão deve permanecer disponível.
3. Abrir Home e Treinos online.
4. Iniciar um treino, concluir uma série e confirmar sucesso na primeira ação.
5. Bloquear a tela por mais tempo que o descanso e validar a recomposição do
   contador ao retornar.
6. Fechar o processo durante um descanso e validar a recomposição ao reabrir.
7. Executar o roteiro completo de 30 minutos de
   `docs/runbooks/us-009b2-device-proof.md`.

## Atualização e rollback

Um novo commit nativo exige novo APK. O APK de `preview` pode coexistir com as
variantes `development` e `production` porque usa pacote próprio. Para rollback,
reinstalar o último APK aprovado da página de builds do EAS. Desinstalar apaga a
sessão, a chave do SecureStore e o banco local; por isso, não desinstalar durante
a prova de persistência.
