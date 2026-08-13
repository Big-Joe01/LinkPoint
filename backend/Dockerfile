# syntax=docker/dockerfile:1.7
# =============================================================================
# LinkPoint backend — production multi-stage build.
# Builds the workspace shared packages + backend, generates the Prisma client,
# and runs a minimal runtime image.
# =============================================================================

ARG NODE_VERSION=22

# ---------- Stage 1: base ----------
FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---------- Stage 2: deps ----------
# Install all workspace dependencies (dev + prod) needed to build.
FROM base AS deps
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
# Install from the root so npm workspaces resolve the local packages.
RUN npm install --no-audit --no-fund

# ---------- Stage 3: build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY backend/ ./backend/
# Build shared packages first (backend imports their compiled dist/).
RUN npm run build --workspace @linkpoint/types \
 && npm run build --workspace @linkpoint/validation \
 && npm run build --workspace @linkpoint/config \
 && npm run build --workspace @linkpoint/shared
# Generate the Prisma client into backend/prisma/generated/client.
RUN npm --workspace backend run db:generate
# Compile the backend to backend/dist.
RUN npm --workspace backend run build
# Prune to production dependencies for the runtime image.
RUN npm prune --omit=dev

# ---------- Stage 4: runtime ----------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Prisma needs OpenSSL; the slim image omits it. ca-certificates for HTTPS calls.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root user for security.
RUN groupadd --system app && useradd --system --gid app --create-home app

# All dependencies are hoisted to the root node_modules by npm workspaces.
# The @linkpoint/* packages resolve via symlinks in node_modules -> packages/*,
# so each package's package.json (main field) must be present alongside dist/.
# --chown=app so the non-root runtime user can read every file.
COPY --chown=app:app --from=build /app/node_modules ./node_modules
COPY --chown=app:app --from=build /app/backend/dist ./backend/dist
# Prisma schema + migrations + generated client (for migrate deploy at runtime).
COPY --chown=app:app --from=build /app/backend/prisma ./backend/prisma
# Compiled shared workspace packages (resolved via symlinks in node_modules).
COPY --chown=app:app --from=build /app/packages/types/dist ./packages/types/dist
COPY --chown=app:app --from=build /app/packages/types/package.json ./packages/types/package.json
COPY --chown=app:app --from=build /app/packages/validation/dist ./packages/validation/dist
COPY --chown=app:app --from=build /app/packages/validation/package.json ./packages/validation/package.json
COPY --chown=app:app --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --chown=app:app --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=app:app --from=build /app/packages/config/dist ./packages/config/dist
COPY --chown=app:app --from=build /app/packages/config/package.json ./packages/config/package.json
COPY --chown=app:app backend/package.json ./backend/package.json

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/backend
CMD ["node", "dist/main.js"]
