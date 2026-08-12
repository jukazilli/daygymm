import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { dayGymTokens } from "@daygym/design-tokens";

const { color, radius, space, typography } = dayGymTokens;

export default function MobileShell() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.brand}>
          DayGym
        </Text>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Prévia interna</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Treino com mais clareza.
          </Text>
          <Text style={styles.description}>
            O aplicativo será liberado por etapas, com o treino sempre em
            primeiro lugar.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.light.canvas,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: space[8],
    padding: space[4],
  },
  brand: {
    color: color.light.textPrimary,
    fontFamily: typography.family,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  card: {
    gap: space[3],
    borderColor: color.light.border,
    borderRadius: radius.card,
    borderWidth: 1,
    backgroundColor: color.light.card,
    padding: space[6],
  },
  eyebrow: {
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: typography.label,
    fontWeight: "600",
  },
  title: {
    color: color.light.textPrimary,
    fontFamily: typography.family,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  description: {
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: typography.body,
    lineHeight: 24,
  },
});
