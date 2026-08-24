import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // sharp ships platform-specific native binaries. Bundling it can leave the
  // .node file untraced, so `import sharp` throws at module load and takes the
  // whole route down before any handler runs. Externalizing keeps it a plain
  // runtime require, with the binary resolved from node_modules.
  serverExternalPackages: ["@anthropic-ai/sdk", "sharp"],
};

export default nextConfig;
