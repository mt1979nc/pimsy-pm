import type { NextConfig } from "next";
import { LEGACY_PRISM_REDIRECTS } from "./src/lib/area-nav";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return LEGACY_PRISM_REDIRECTS.map((redirect) => ({
      source: redirect.source,
      destination: redirect.destination,
      permanent: false,
    }));
  },
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
