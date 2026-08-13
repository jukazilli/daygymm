import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  transpilePackages: ["@daygym/contracts", "@daygym/design-tokens"],
};

export default nextConfig;
