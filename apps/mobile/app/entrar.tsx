import { useLocalSearchParams } from "expo-router";

import { MobileAuthScreen } from "./ui/mobile-auth-screen";

export default function SignInScreen() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();

  return (
    <MobileAuthScreen
      code={Array.isArray(code) ? code[0] : code}
      mode="sign-in"
    />
  );
}
