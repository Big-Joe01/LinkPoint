# LinkPoint Deployment Guide

LinkPoint is a full-stack platform with four deployable surfaces:

| Surface | Tech | Suggested host |
|---|---|---|
| **Backend API** | Fastify, Node 22, TypeScript | Railway / Render / Fly / any container host |
| **Admin dashboard** | Next.js 14 (standalone) | Vercel / any container host |
| **Mobile app** | Expo (React Native) | Expo EAS Build → App Store / Play Store |
| **MySQL** | 8.0 | Managed DB (PlanetScale / Aiven / RDS) or the compose service |
| **Redis** | 7 | Managed (Upstash / ElastiCache) or the compose service |

> The backend depends on MySQL and Redis. The admin dashboard and mobile app both talk to the backend over HTTPS — they never connect to the database directly.

---

## 1. Prerequisites

1. A host with **Docker** + **Docker Compose** (for the all-in-one path), **or** accounts on Railway/Render/Fly + a managed MySQL + managed Redis (for the split path).
2. Real credentials for:
   - **Flutterwave** — live (or test) public key, secret key, encryption key, and a webhook hash. Create a webhook pointing to `https://<api-domain>/api/payments/flutterwave/webhook`.
   - **Cloudinary** — cloud name, API key, API secret (for property images/videos).
   - **Maps** — a Google Maps / Mapbox API key.
3. Strong random secrets for `JWT_SECRET` and `JWT_REFRESH_SECRET`:
   ```bash
   openssl rand -hex 32   # run twice — once for each secret
   ```
4. Real domain(s) + TLS (use a reverse proxy like Caddy/Nginx or your host's managed TLS).

---

## 2. Environment configuration

Copy the example and fill in real values:

```bash
cp .env.example .env.prod
# edit .env.prod — set real secrets, passwords, domains, and keys
```

Critical values you **must** change from the defaults:

| Variable | Why |
|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Default placeholders let anyone forge auth tokens. Use `openssl rand -hex 32`. |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | Default passwords are insecure. |
| `DATABASE_URL` | Must use a strong password; host is `mysql` inside compose, `localhost` for local dev. |
| `CORS_ORIGINS` | Set to your real admin + mobile web origins (comma-separated). |
| `APP_URL`, `NEXT_PUBLIC_API_URL` | Your public API URL. |
| `FLUTTERWAVE_*`, `CLOUDINARY_*`, `MAPS_API_KEY` | Real third-party credentials. |

---

## 3. Path A — Full stack with Docker Compose (single host)

Bring up backend + admin + MySQL + Redis together:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Run database migrations against the live MySQL:

```bash
docker compose -f docker-compose.prod.yml exec backend \
  npx prisma migrate deploy --schema prisma/schema.prisma
```

Verify:
```bash
curl https://<api-domain>/api/health   # → {"status":"ok",...}
```

Put a reverse proxy (Caddy/Nginx) in front to terminate TLS and route:
- `api.your-domain.com` → backend `:8080`
- `admin.your-domain.com` → admin `:3000`

---

## 4. Path B — Split hosting (managed services)

### Backend (Railway / Render / Fly)

1. Create a new service pointing at this repo, root directory = `/backend` (or use the root `backend/Dockerfile` with build context at repo root).
2. Add all the env vars from `.env.prod` (secrets stay in the host dashboard, never in code).
3. Set the start command to `node dist/main.js` (the image's default) and expose port `8080`.
4. Use a managed MySQL instance and set `DATABASE_URL` to its connection string. The Prisma `mysql` engine works with any MySQL 8 host.
5. Use managed Redis and point `REDIS_URL` at it.
6. Run migrations as a release step or manually after deploy:
   ```bash
   npx prisma migrate deploy --schema prisma/schema.prisma
   ```

### Admin (Vercel)

1. Import the repo, set the root to `apps/admin`.
2. Add env var `NEXT_PUBLIC_API_URL=https://<api-domain>/api`.
3. Build command `next build` (standalone output is already enabled).
4. Deploy.

### MySQL / Redis

Use a managed provider (PlanetScale, Aiven, RDS for MySQL; Upstash, ElastiCache for Redis) for backups, high availability, and scaling. The compose MySQL/Redis is fine for a small launch but should be swapped for managed services as you grow.

---

## 5. Mobile app — Expo EAS Build & Submit

The mobile app ships via Expo Application Services (EAS), not a traditional web host.

### One-time setup
```bash
cd apps/mobile
npm install -g eas-cli
eas login                       # your Expo account
eas build:configure             # writes eas.json (already present here)
```

### Build for internal testing
```bash
eas build --profile preview --platform android   # .apk
eas build --profile preview --platform ios       # TestFlight (needs Apple Dev account)
```

### Build for store release
```bash
eas build --profile production --platform android   # .aab (Play Store)
eas build --profile production --platform ios       # App Store
```

### Submit to stores
Edit `apps/mobile/eas.json` → `submit.production`:
- `ios.ascAppId` and `ios.appleTeamId` — from your Apple Developer account.
- `android.serviceAccountKeyPath` — a Play Console service account JSON key.

Then:
```bash
eas submit --platform ios
eas submit --platform android
```

> Building requires an Apple Developer Program membership ($99/yr) for iOS and a Google Play Console ($25 one-time) for Android.

Point the app at your live API: set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` (or via `eas env`).

---

## 6. Flutterwave webhook

1. In the Flutterwave dashboard → Settings → Webhooks, add:
   `https://<api-domain>/api/payments/flutterwave/webhook`
2. Copy the webhook secret hash into `FLUTTERWAVE_WEBHOOK_HASH`.
3. The backend verifies the signature on every webhook and processes events idempotently — the wallet ledger is only credited after server-side verification, never on a frontend callback.

---

## 7. Post-deploy checklist

- [ ] `JWT_SECRET` / `JWT_REFRESH_SECRET` are strong random values (not placeholders).
- [ ] MySQL + Redis passwords changed from defaults.
- [ ] `CORS_ORIGINS` set to your real origins.
- [ ] HTTPS/TLS active on all public URLs.
- [ ] `prisma migrate deploy` run successfully.
- [ ] `/api/health` returns ok.
- [ ] Flutterwave webhook reachable and signature verified.
- [ ] Cloudinary uploads work (test creating a property with media).
- [ ] Map tiles load (test the Explore map screen).
- [ ] Admin dashboard loads and can log in.
- [ ] Mobile app connects to the live API (set `EXPO_PUBLIC_API_URL`).
- [ ] Database backups configured for MySQL.
- [ ] Rate limits / WAF configured at the reverse proxy if needed.

---

## 8. Local development

```bash
npm run db:up              # MySQL + Redis via docker-compose
npm run db:generate        # Prisma client
npm run db:migrate         # apply migrations (dev)
npm run backend:dev        # API on :8080
# in another terminal
npm --workspace apps/admin run dev   # admin on :3000
npm run mobile:start                # Expo dev client
```
