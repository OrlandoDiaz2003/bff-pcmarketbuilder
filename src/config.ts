import 'dotenv/config';

// 1. Funciones utilitarias para procesar las variables de entorno
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
  httpsPort: numberFromEnv('HTTPS_PORT', 4443),
  publicationsBaseUrl: urlFromEnv('PUBLICATIONS_BASE_URL', 'http://100.55.98.236:8083/api/v1/publications'),
  productsBaseUrl: urlFromEnv('PRODUCTS_BASE_URL', 'http://34.239.255.125:8082/api/v1/products'),
  usersBaseUrl: urlFromEnv('USERS_BASE_URL', 'http://localhost:8081/api/v1/users'),
  // payments expone /api/payments/orders; shipments y reports-service cuelgan de /api/v1.
  paymentsBaseUrl: urlFromEnv('PAYMENTS_BASE_URL', 'http://localhost:8086/api/payments'),
  shipmentsBaseUrl: urlFromEnv('SHIPPING_BASE_URL', 'http://localhost:8084/api/v1'),
  reportsBaseUrl: urlFromEnv('REPORTS_BASE_URL', 'http://localhost:8087/api/v1'),


  // GitHub Pages (front desplegado) + Angular local.
  corsOrigins: listFromEnv('CORS_ORIGINS', ['https://sotom28.github.io', 'http://localhost:4200']),
  // Identificadores públicos del App Registration (no son secretos; el front ya los expone).
  azureTenantId: process.env.AZURE_TENANT_ID || '35365687-614a-481c-8b8b-b4debee24880',
  azureClientId: process.env.AZURE_CLIENT_ID || '6c2342af-22f6-4de8-a545-2a3b04e7d1ff',
  cacheTtlMs: numberFromEnv('CACHE_TTL_MS', 300_000),
  userCacheTtlMs: numberFromEnv('USER_CACHE_TTL_MS', 300_000),
  // Alta/actualización automática del usuario en ms-user a partir del token (ver services/userSync.ts).
  userSyncTtlMs: numberFromEnv('USER_SYNC_TTL_MS', 1_800_000),
  userSyncRetryMs: numberFromEnv('USER_SYNC_RETRY_MS', 30_000),
  upstreamTimeoutMs: numberFromEnv('UPSTREAM_TIMEOUT_MS', 5_000),
  logFile: process.env.LOG_FILE || '',
  catalogPageSize: 100,
  // Hosts que va a llevar el SAN del certificado autofirmado (ver src/lib/tls.ts).
  // Agrega aquí la IP pública/privada actual del task de ECS si cambia.
  tlsHosts: (process.env.TLS_HOSTS || 'localhost,127.0.0.1,34.207.222.191,172.31.3.73')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
  // Identidad con la que el BFF opera por su cuenta (p. ej. marcar una publicación IN_INSPECTION tras un pago).
  // Válida porque los microservicios solo son alcanzables desde el BFF (subred privada).
  serviceIdentity: { userId: 'bff-system', role: 'WORKSHOP_ADMIN' },
  allowDevAuthHeaders:
    process.env.ALLOW_DEV_AUTH_HEADERS === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH_HEADERS !== 'false'),
} as const;
