# syntax=docker/dockerfile:1.7
# =============================================================================
# LinkPoint admin dashboard — production multi-stage build.
# Uses Next.js standalone output for a minimal runtime image.
# =============================================================================

ARG NODE_VERSION=22

# ---------- Stage 1: base ----------
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app

# ---------- Stage 2: deps ----------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/types/package.json ./packages/types/package.json
RUN npm install --no-audit --no-fund

# ---------- Stage 3: build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY apps/admin/ ./apps/admin/
# Build the shared types package first (transpiled into admin bundle).
RUN npm run build --workspace @linkpoint/types
# Build the admin app with standalone output.
RUN npm run build --workspace @linkpoint/admin

# ---------- Stage 4: runtime ----------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --create-home app

# Copy the standalone server bundle + static assets.
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /app/apps/admin/public ./apps/admin/public

USER app
EXPOSE 3000

CMD ["node", "apps/admin/server.js"]
