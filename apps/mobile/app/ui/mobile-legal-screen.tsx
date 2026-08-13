import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { dayGymTokens } from "@daygym/design-tokens";

const { color, radius, space, typography } = dayGymTokens;

export function MobileLegalScreen({
  paragraphs,
  title,
}: Readonly<{ paragraphs: readonly string[]; title: string }>) {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>DayGym</Text>
        <View style={styles.article}>
          <Text style={styles.eyebrow}>Versão de teste · 13/08/2026</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.button,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Text style={styles.buttonLabel}>Voltar para criar conta</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.light.canvas },
  content: { gap: space[8], padding: space[4] },
  brand: {
    color: color.light.textPrimary,
    fontFamily: typography.familyBold,
    fontSize: 24,
  },
  article: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    gap: space[4],
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
    lineHeight: 36,
  },
  paragraph: {
    color: color.light.textSecondary,
    fontFamily: typography.family,
    fontSize: typography.body,
    lineHeight: 25,
  },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space[2],
    borderColor: color.light.border,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: color.light.card,
    paddingHorizontal: space[5],
  },
  buttonPressed: { backgroundColor: color.light.actionSoft },
  buttonLabel: {
    color: color.light.action,
    fontFamily: typography.familyBold,
    fontSize: typography.body,
  },
});
