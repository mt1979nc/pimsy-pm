# PIMSY Implementations — production image for Azure App Service (Web App
# for Containers) or Azure Container Apps.
#
# Build:  docker build -t pimsy-pm .
# Run:    docker run -p 3000:3000 --env-file .env.local pimsy-pm
#
# Multi-stage: the final image is just the Next.js "standalone" output
# (server.js + the node_modules it actually needs) plus static assets — not
# the full source tree or dev dependencies.
#
# Database migrations are NOT run by this image. Run them as a separate step
# (the GitHub Actions workflow in .github/workflows/deploy-azure.yml does
# this before rolling out a new revision) — see azure/README.md. Running
# `drizzle-kit migrate` from inside every container start would race when
# more than one replica starts at once.

# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Needed at build time only so `next build` can type-check and prerender.
# Real values are supplied at deploy time as container app settings — see
# azure/README.md. These are never baked into the final image (see the
# runner stage below, which only copies the standalone build output).
ENV DATABASE_URL="postgresql://placeholder@localhost/placeholder"
ENV AUTH_SECRET="placeholder-build-time-value-only"
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Runs as an unprivileged user, same convention as the official Next.js
# Docker example.
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --system nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
