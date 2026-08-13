import {
  parsePublicSupabaseConfig,
  type PublicSupabaseConfig,
} from "@daygym/config";

export function getWebSupabasePublicConfig(): PublicSupabaseConfig {
  return parsePublicSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
