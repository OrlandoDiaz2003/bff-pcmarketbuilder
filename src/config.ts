import 'dotenv/config';

const numberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Variable de entorno ${name} no es un número válido: ${raw}`);
  }
  return value;
};

const urlFromEnv = (name: string, fallback: string): string =>
  (process.env[name] ?? fallback).replace(/\/+$/, '');

const listFromEnv = (name: string, fallback: string[]): string[] => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const config = {
  port: numberFromEnv('PORT', 4000),
  publicationsBaseUrl: urlFromEnv('PUBLICATIONS_BASE_URL', 'http://localhost:8083/api/v1/publications'),
  productsBaseUrl: urlFromEnv('PRODUCTS_BASE_URL', 'http://localhost:8080/api/v1/products'),
  usersBaseUrl: urlFromEnv('USERS_BASE_URL', 'http://localhost:8081/api/v1/users'),
  paymentsBaseUrl: urlFromEnv('PAYMENTS_BASE_URL', 'http://localhost:8086/api/payments/orders'),
  reportsBaseUrl: urlFromEnv('REPORTS_BASE_URL', 'http://localhost:8087/api/v1'),
  corsOrigins: listFromEnv('CORS_ORIGINS', ['http://localhost:4200']),
  azureTenantId: process.env.AZURE_TENANT_ID ?? '',
  azureClientId: process.env.AZURE_CLIENT_ID ?? '',
  cacheTtlMs: numberFromEnv('CACHE_TTL_MS', 300_000),
  userCacheTtlMs: numberFromEnv('USER_CACHE_TTL_MS', 300_000),
  // Alta/actualización automática del usuario en ms-user a partir del token (ver services/userSync.ts).
  userSyncTtlMs: numberFromEnv('USER_SYNC_TTL_MS', 1_800_000),
  userSyncRetryMs: numberFromEnv('USER_SYNC_RETRY_MS', 30_000),
  upstreamTimeoutMs: numberFromEnv('UPSTREAM_TIMEOUT_MS', 5_000),
  logFile: process.env.LOG_FILE || '',
  catalogPageSize: 100,
  // Identidad con la que el BFF opera por su cuenta (p. ej. marcar una publicación IN_INSPECTION tras un pago).
  // Válida porque los microservicios solo son alcanzables desde el BFF (subred privada).
  serviceIdentity: { userId: 'bff-system', role: 'WORKSHOP_ADMIN' },
  allowDevAuthHeaders:
    process.env.ALLOW_DEV_AUTH_HEADERS === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH_HEADERS !== 'false'),
} as const;