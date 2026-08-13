import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Onest_400Regular } from "@expo-google-fonts/onest/400Regular";
import { Onest_600SemiBold } from "@expo-google-fonts/onest/600SemiBold";
import { Onest_700Bold } from "@expo-google-fonts/onest/700Bold";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Onest: Onest_400Regular,
    "Onest-Bold": Onest_700Bold,
    "Onest-SemiBold": Onest_600SemiBold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
