import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@daygym/design-tokens"],
};

export default nextConfig;
