// Centralized, validated application configuration.
// Reads from process.env. Never logs or exposes secrets.

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  appUrl: string;
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    secret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
    bcryptRounds: number;
  };
  flutterwave: {
    publicKey: string;
    secretKey: string;
    encryptionKey: string;
    webhookHash: string;
    apiBase: string;
  };
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  mapsApiKey: string;
  deepLinkScheme: string;
  webhookIdempotencyTtlSeconds: number;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  cached = {
    nodeEnv: optional('NODE_ENV', 'development'),
    port: int('PORT', 8080),
    apiPrefix: optional('API_PREFIX', '/api'),
    corsOrigins: optional('CORS_ORIGINS', 'http://localhost:8081,http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    appUrl: required('APP_URL', 'http://localhost:8080'),
    databaseUrl: required('DATABASE_URL', 'mysql://linkpoint:linkpointpass@localhost:3306/linkpoint'),
    redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
    jwt: {
      secret: required('JWT_SECRET', 'dev-access-secret-change-me'),
      refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
      accessTtl: optional('JWT_ACCESS_TTL', '15m'),
      refreshTtl: optional('JWT_REFRESH_TTL', '7d'),
      bcryptRounds: int('BCRYPT_ROUNDS', 12),
    },
    flutterwave: {
      publicKey: optional('FLUTTERWAVE_PUBLIC_KEY', ''),
      secretKey: optional('FLUTTERWAVE_SECRET_KEY', ''),
      encryptionKey: optional('FLUTTERWAVE_ENCRYPTION_KEY', ''),
      webhookHash: optional('FLUTTERWAVE_WEBHOOK_HASH', ''),
      apiBase: optional('FLUTTERWAVE_API_BASE', 'https://api.flutterwave.com/v3'),
    },
    cloudinary: {
      cloudName: optional('CLOUDINARY_CLOUD_NAME', ''),
      apiKey: optional('CLOUDINARY_API_KEY', ''),
      apiSecret: optional('CLOUDINARY_API_SECRET', ''),
    },
    mapsApiKey: optional('MAPS_API_KEY', ''),
    deepLinkScheme: optional('DEEP_LINK_SCHEME', 'linkpoint'),
    webhookIdempotencyTtlSeconds: int('WALLET_WEBHOOK_IDEMPOTENCY_TTL_SECONDS', 86400),
  };
  return cached;
}
