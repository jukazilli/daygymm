import {
  parsePublicSupabaseConfig,
  type PublicSupabaseConfig,
} from "@daygym/config";

export function getMobileSupabasePublicConfig(): PublicSupabaseConfig {
  return parsePublicSupabaseConfig({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
