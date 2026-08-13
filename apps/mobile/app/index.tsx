import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { dayGymTokens } from "@daygym/design-tokens";

const { color, radius, space, typography } = dayGymTokens;

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>DayGym</Text>
          <Text style={styles.environment}>
            Prévia interna · dados sintéticos
          </Text>
        </View>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Treino com direção</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Plano claro. Registro rápido. Evolução visível.
          </Text>
          <Text style={styles.support}>
            Entre na sua conta ou crie um acesso para começar.
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/entrar")}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.primaryPressed : undefined,
              ]}
            >
              <Text style={styles.primaryLabel}>Entrar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/criar-conta")}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.secondaryPressed : undefined,
              ]}
            >
              <Text style={styles.secondaryLabel}>Criar conta</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.light.canvas },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    gap: space[12],
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
  hero: { gap: space[4], paddingBottom: space[8] },
  eyebrow: {
    color: color.light.action,
    fontFamily: typography.familyBold,
    fontSize: typography.label,
  },
  title: {
    maxWidth: 520,
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: 40,
    letterSpacing: -1.3,
    lineHeight: 44,
  },
  support: {
    maxWidth: 420,
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: typography.body,
    lineHeight: 24,
  },
  actions: { gap: space[3], marginTop: space[2] },
  primaryButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    backgroundColor: color.light.action,
    paddingHorizontal: space[5],
  },
  primaryPressed: { backgroundColor: color.light.actionPressed },
  primaryLabel: {
    color: color.light.card,
    fontFamily: typography.familyBold,
    fontSize: typography.body,
  },
  secondaryButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderColor: color.light.border,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: color.light.card,
    paddingHorizontal: space[5],
  },
  secondaryPressed: { backgroundColor: color.light.actionSoft },
  secondaryLabel: {
    color: color.light.action,
    fontFamily: typography.familyBold,
    fontSize: typography.body,
  },
});
