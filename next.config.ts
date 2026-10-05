import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.RM_NEXT_DIST_DIR || ".next",
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
