import { parsePublicWebConfig, type PublicWebConfig } from "@daygym/config";

export function getWebPublicConfig(): PublicWebConfig {
  return parsePublicWebConfig({
    siteUrl: process.env.NEXT_PUBLIC_DAYGYM_SITE_URL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
