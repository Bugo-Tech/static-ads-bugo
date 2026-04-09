import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
