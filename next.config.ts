import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a self-contained .next/standalone build (server + only the
  // node_modules it actually needs) — what the Dockerfile copies into the
  // production image for Azure App Service / Container Apps.
  output: "standalone",
  experimental: {
    // Keeps Prisma from being bundled into the edge/server chunks incorrectly.
    // Match MAX_UPLOAD_BYTES in src/lib/storage.ts (25 MB). 5mb was why
    // download → fill → resubmit looked broken for real spreadsheets/PDFs.
    serverActions: { bodySizeLimit: "25mb" },
  },
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
