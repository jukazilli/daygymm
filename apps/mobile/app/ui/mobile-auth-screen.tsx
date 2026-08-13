import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { dayGymTokens } from "@daygym/design-tokens";
import type { AuthFailure, AuthGateway } from "@daygym/contracts";

import { createMobileAuthGateway } from "../../lib/auth/mobile-auth-gateway";

export type MobileAuthMode =
  "account" | "recover" | "reset-password" | "sign-in" | "sign-up";

interface MobileAuthScreenProps {
  readonly code?: string;
  readonly gateway?: AuthGateway;
  readonly mode: MobileAuthMode;
}

type FieldName = "email" | "password" | "passwordConfirmation";
type FieldErrors = Partial<
  Record<FieldName | "adult" | "privacy" | "terms", string>
>;

const { color, radius, space, typography } = dayGymTokens;

const copyByFailure: Record<AuthFailure, string> = {
  "account-incomplete":
    "Não foi possível concluir o acesso desta conta. Tente criar a conta novamente.",
  configuration:
    "O acesso está temporariamente indisponível. Tente novamente mais tarde.",
  credentials: "Não foi possível entrar. Confira os dados e tente novamente.",
  "link-invalid":
    "Este link não é mais válido. Solicite um novo link para continuar.",
  "rate-limited":
    "Muitas tentativas seguidas. Aguarde um pouco e tente de novo.",
  unexpected: "Não foi possível concluir agora. Tente novamente.",
};

const modeCopy = {
  recover: {
    eyebrow: "Recuperar acesso",
    title: "Vamos enviar um link.",
    support: "Use o e-mail da sua conta.",
  },
  "reset-password": {
    eyebrow: "Nova senha",
    title: "Crie uma senha segura.",
    support: "Depois da troca, entre novamente na sua conta.",
  },
  "sign-in": {
    eyebrow: "Sua conta",
    title: "Continue seu treino.",
    support: "Entre para acessar seu plano e sua evolução.",
  },
  "sign-up": {
    eyebrow: "Criar conta",
    title: "Comece com direção.",
    support: "Seu plano, seus registros e sua evolução em um só lugar.",
  },
} as const;

function validateEmail(value: string): string | undefined {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? undefined
    : "Digite um e-mail válido.";
}

function validatePassword(value: string): string | undefined {
  return value.length >= 8 ? undefined : "Use pelo menos 8 caracteres.";
}

function AuthField({
  error,
  fieldRef,
  label,
  ...inputProps
}: Readonly<
  TextInputProps & {
    error?: string;
    fieldRef: React.RefObject<TextInput | null>;
    label: string;
  }
>) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        aria-invalid={Boolean(error)}
        placeholderTextColor={color.light.textSecondary}
        ref={fieldRef}
        style={[styles.input, error ? styles.inputError : undefined]}
        {...inputProps}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function CheckRow({
  checked,
  error,
  label,
  onPress,
}: Readonly<{
  checked: boolean;
  error?: string;
  label: string;
  onPress: () => void;
}>) {
  return (
    <View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        aria-invalid={Boolean(error)}
        accessibilityLabel={label}
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [
          styles.checkRow,
          pressed ? styles.pressed : undefined,
        ]}
      >
        <View
          style={[styles.checkbox, checked ? styles.checkboxChecked : null]}
        >
          <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
        </View>
        <Text style={styles.checkLabel}>{label}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function PrimaryButton({
  disabled,
  label,
  loading,
  onPress,
}: Readonly<{
  disabled?: boolean;
  label: string;
  loading: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed ? styles.primaryButtonPressed : undefined,
        disabled || loading ? styles.buttonDisabled : undefined,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color.light.card} />
      ) : (
        <Text style={styles.primaryButtonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

function TextLink({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) {
  return (
    <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

export function MobileAuthScreen({
  code,
  gateway: providedGateway,
  mode,
}: MobileAuthScreenProps) {
  const router = useRouter();
  const gatewayRef = useRef<AuthGateway | undefined>(providedGateway);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);
  const [adult, setAdult] = useState(false);
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [sessionState, setSessionState] = useState<
    "checking" | "ready" | "unavailable"
  >(mode === "account" ? "checking" : "ready");
  const [terms, setTerms] = useState(false);
  const [isRecoveryReady, setIsRecoveryReady] = useState(
    mode !== "reset-password",
  );

  function gateway() {
    gatewayRef.current ??= createMobileAuthGateway();
    return gatewayRef.current;
  }

  useEffect(
    () => () => {
      const activeGateway = gatewayRef.current;
      if (activeGateway && "dispose" in activeGateway) {
        void (
          activeGateway as ReturnType<typeof createMobileAuthGateway>
        ).dispose();
      }
    },
    [],
  );

  useEffect(() => {
    if (mode === "reset-password") {
      if (!code) {
        setFeedback(copyByFailure["link-invalid"]);
        return;
      }
      void gateway()
        .exchangeAuthCode(code)
        .then((result) => {
          if (result.ok) {
            setIsRecoveryReady(true);
          } else {
            setFeedback(copyByFailure[result.reason]);
          }
        });
    }

    if (mode === "sign-in" && code) {
      setIsLoading(true);
      void gateway()
        .exchangeAuthCode(code)
        .then((result) => {
          setIsLoading(false);
          if (result.ok) {
            router.replace("/conta");
          } else {
            setFeedback(copyByFailure[result.reason]);
          }
        });
    }

    if (mode === "account") {
      void gateway()
        .hasActiveEligibleSession()
        .then((result) => {
          if (result.ok && result.value) {
            setSessionState("ready");
          } else if (result.ok) {
            router.replace("/entrar");
          } else {
            setFeedback(copyByFailure[result.reason]);
            setSessionState("unavailable");
          }
        });
    }
  }, [code, mode, router]);

  function focusFirstError(nextErrors: FieldErrors) {
    if (nextErrors.email) {
      emailRef.current?.focus();
    } else if (nextErrors.password) {
      passwordRef.current?.focus();
    } else if (nextErrors.passwordConfirmation) {
      confirmationRef.current?.focus();
    }
  }

  async function handleSubmit() {
    setFeedback(undefined);
    const normalizedEmail = email.trim();
    const nextErrors: FieldErrors = {};

    if (mode !== "reset-password") {
      nextErrors.email = validateEmail(normalizedEmail);
    }
    if (mode !== "recover") {
      nextErrors.password = validatePassword(password);
    }
    if (mode === "sign-up" || mode === "reset-password") {
      nextErrors.passwordConfirmation =
        password === passwordConfirmation
          ? undefined
          : "As senhas precisam ser iguais.";
    }
    if (mode === "sign-up") {
      nextErrors.adult = adult
        ? undefined
        : "Confirme que você tem 18 anos ou mais.";
      nextErrors.terms = terms
        ? undefined
        : "Aceite os Termos de teste para continuar.";
      nextErrors.privacy = privacy
        ? undefined
        : "Confirme a leitura do Aviso de privacidade.";
    }

    const presentErrors = Object.fromEntries(
      Object.entries(nextErrors).filter((entry) => entry[1]),
    ) as FieldErrors;
    setErrors(presentErrors);
    if (Object.keys(presentErrors).length > 0) {
      focusFirstError(presentErrors);
      return;
    }

    setIsLoading(true);
    const result =
      mode === "sign-in"
        ? await gateway().signIn(normalizedEmail, password)
        : mode === "sign-up"
          ? await gateway().signUp({
              email: normalizedEmail,
              password,
              isAdult: true,
            })
          : mode === "recover"
            ? await gateway().requestPasswordReset(normalizedEmail)
            : await gateway().updatePasswordAndSignOut(password);
    setIsLoading(false);

    if (!result.ok) {
      setFeedback(copyByFailure[result.reason]);
      return;
    }

    if (mode === "sign-in") {
      router.replace("/conta");
    } else if (mode === "sign-up" || mode === "recover") {
      setRecoveryRequested(true);
    } else {
      router.replace("/entrar?senha=alterada");
    }
  }

  async function handleSignOut() {
    setIsLoading(true);
    const result = await gateway().signOut();
    setIsLoading(false);
    if (result.ok) {
      router.replace("/entrar");
    } else {
      setFeedback(copyByFailure[result.reason]);
    }
  }

  if (mode === "account") {
    const accountTitle = {
      checking: "Verificando acesso…",
      ready: "Conta pronta.",
      unavailable: "Acesso indisponível.",
    }[sessionState];

    return (
      <AuthShell>
        <Text style={styles.eyebrow}>Sua conta</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {accountTitle}
        </Text>
        {sessionState === "ready" ? (
          <>
            <Text style={styles.support}>
              Seu acesso está ativo neste aparelho.
            </Text>
            <PrimaryButton
              label="Sair neste aparelho"
              loading={isLoading}
              onPress={() => void handleSignOut()}
            />
          </>
        ) : sessionState === "checking" ? (
          <ActivityIndicator color={color.light.action} size="large" />
        ) : (
          <TextLink
            label="Voltar para entrar"
            onPress={() => router.replace("/entrar")}
          />
        )}
        {feedback ? <ErrorMessage message={feedback} /> : null}
      </AuthShell>
    );
  }

  const pageCopy = modeCopy[mode];
  const buttonLabel = {
    recover: "Enviar link",
    "reset-password": "Salvar nova senha",
    "sign-in": "Entrar",
    "sign-up": "Criar conta",
  }[mode];

  return (
    <AuthShell>
      <Text style={styles.eyebrow}>{pageCopy.eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {pageCopy.title}
      </Text>
      <Text style={styles.support}>{pageCopy.support}</Text>

      {recoveryRequested ? (
        <View accessibilityLiveRegion="polite" style={styles.successMessage}>
          <Text style={styles.statusTitle}>Confira seu e-mail.</Text>
          <Text style={styles.statusText}>
            Se o endereço puder ser usado, você receberá um link para continuar.
          </Text>
        </View>
      ) : (
        <View style={styles.form}>
          {mode !== "reset-password" ? (
            <AuthField
              autoCapitalize="none"
              autoComplete="email"
              error={errors.email}
              fieldRef={emailRef}
              keyboardType="email-address"
              label="E-mail"
              onChangeText={setEmail}
              returnKeyType={mode === "recover" ? "done" : "next"}
              value={email}
            />
          ) : null}
          {mode !== "recover" ? (
            <AuthField
              autoCapitalize="none"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              error={errors.password}
              fieldRef={passwordRef}
              label={mode === "reset-password" ? "Nova senha" : "Senha"}
              onChangeText={setPassword}
              secureTextEntry
              value={password}
            />
          ) : null}
          {mode === "sign-up" || mode === "reset-password" ? (
            <AuthField
              autoCapitalize="none"
              autoComplete="new-password"
              error={errors.passwordConfirmation}
              fieldRef={confirmationRef}
              label="Confirmar senha"
              onChangeText={setPasswordConfirmation}
              secureTextEntry
              value={passwordConfirmation}
            />
          ) : null}

          {mode === "sign-up" ? (
            <View style={styles.consentGroup}>
              <Text style={styles.label}>Confirmações necessárias</Text>
              <CheckRow
                checked={adult}
                error={errors.adult}
                label="Confirmo que tenho 18 anos ou mais."
                onPress={() => setAdult((value) => !value)}
              />
              <CheckRow
                checked={terms}
                error={errors.terms}
                label="Li e aceito os Termos de teste."
                onPress={() => setTerms((value) => !value)}
              />
              <TextLink
                label="Ler os Termos de teste"
                onPress={() => router.push("/termos")}
              />
              <CheckRow
                checked={privacy}
                error={errors.privacy}
                label="Li o Aviso de privacidade."
                onPress={() => setPrivacy((value) => !value)}
              />
              <TextLink
                label="Ler o Aviso de privacidade"
                onPress={() => router.push("/privacidade")}
              />
            </View>
          ) : null}

          {feedback ? <ErrorMessage message={feedback} /> : null}
          <PrimaryButton
            disabled={!isRecoveryReady}
            label={buttonLabel}
            loading={isLoading}
            onPress={() => void handleSubmit()}
          />
        </View>
      )}

      <View accessibilityLabel="Outras opções de acesso" style={styles.links}>
        {mode === "sign-in" ? (
          <>
            <TextLink
              label="Esqueci minha senha"
              onPress={() => router.push("/recuperar-acesso")}
            />
            <View style={styles.inlineLink}>
              <Text style={styles.secondaryText}>Ainda não tem conta?</Text>
              <TextLink
                label="Criar conta"
                onPress={() => router.push("/criar-conta")}
              />
            </View>
          </>
        ) : (
          <TextLink
            label="Voltar para entrar"
            onPress={() => router.replace("/entrar")}
          />
        )}
      </View>
    </AuthShell>
  );
}

function AuthShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardArea}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>DayGym</Text>
            <Text style={styles.environment}>
              Prévia interna · dados sintéticos
            </Text>
          </View>
          <View style={styles.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ErrorMessage({ message }: Readonly<{ message: string }>) {
  return (
    <View accessibilityLiveRegion="assertive" style={styles.errorMessage}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.light.canvas },
  keyboardArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    gap: space[8],
    padding: space[4],
  },
  brandBlock: { gap: space[1] },
  brand: {
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  environment: {
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: 13,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: space[3],
    borderColor: color.light.border,
    borderRadius: radius.card,
    borderWidth: 1,
    backgroundColor: color.light.card,
    padding: space[6],
  },
  eyebrow: {
    color: color.light.textSecondary,
    fontFamily: typography.familySemiBold,
    fontSize: typography.label,
  },
  title: {
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: 30,
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  support: {
    marginBottom: space[5],
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: typography.body,
    lineHeight: 24,
  },
  form: { gap: space[5] },
  fieldGroup: { gap: space[2] },
  label: {
    color: color.light.textPrimary,
    fontFamily: typography.familySemiBold,
    fontSize: typography.label,
  },
  input: {
    minHeight: 56,
    borderColor: color.light.border,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: color.light.card,
    color: color.light.textPrimary,
    fontFamily: typography.family,
    fontSize: typography.body,
    paddingHorizontal: space[4],
  },
  inputError: { borderColor: color.light.danger, borderWidth: 2 },
  fieldError: {
    color: color.light.danger,
    fontFamily: typography.family,
    fontSize: typography.label,
    lineHeight: 20,
  },
  consentGroup: { gap: space[2] },
  checkRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingVertical: space[2],
  },
  pressed: { opacity: 0.72 },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderColor: color.light.border,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: color.light.card,
  },
  checkboxChecked: {
    borderColor: color.light.action,
    backgroundColor: color.light.action,
  },
  checkmark: {
    color: color.light.actionContrast,
    fontFamily: typography.familyBold,
    fontSize: 16,
  },
  checkLabel: {
    flex: 1,
    color: color.light.textPrimary,
    fontFamily: typography.family,
    fontSize: typography.body,
    lineHeight: 23,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    backgroundColor: color.light.action,
    paddingHorizontal: space[5],
  },
  primaryButtonPressed: { backgroundColor: color.light.actionPressed },
  buttonDisabled: { opacity: 0.62 },
  primaryButtonLabel: {
    color: color.light.actionContrast,
    fontFamily: typography.familyBold,
    fontSize: typography.body,
  },
  link: {
    color: color.light.action,
    fontFamily: typography.familyBold,
    fontSize: typography.label,
    lineHeight: 22,
  },
  links: { gap: space[4], marginTop: space[3] },
  inlineLink: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  secondaryText: {
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: typography.label,
    lineHeight: 22,
  },
  errorMessage: {
    borderLeftColor: color.light.danger,
    borderLeftWidth: 4,
    borderRadius: radius.control,
    backgroundColor: color.light.canvas,
    padding: space[4],
  },
  errorText: {
    color: color.light.danger,
    fontFamily: typography.family,
    fontSize: typography.label,
    lineHeight: 20,
  },
  successMessage: {
    gap: space[1],
    borderLeftColor: color.light.success,
    borderLeftWidth: 4,
    borderRadius: radius.control,
    backgroundColor: color.light.canvas,
    padding: space[4],
  },
  statusTitle: {
    color: color.light.success,
    fontFamily: typography.familyBold,
    fontSize: typography.body,
  },
  statusText: {
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: typography.label,
    lineHeight: 20,
  },
});
