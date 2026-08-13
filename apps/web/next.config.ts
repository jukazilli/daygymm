import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  transpilePackages: ["@daygym/design-tokens"],
};

export default nextConfig;
