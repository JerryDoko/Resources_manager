import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp", "iconv-lite"],
  // Electron copies the platform-specific voice runtime outside the standalone server.
  outputFileTracingExcludes: { "*": ["./runtime/kokoro/**/*"] },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
