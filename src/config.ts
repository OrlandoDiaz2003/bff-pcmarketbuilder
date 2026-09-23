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
  publicationsBaseUrl: urlFromEnv('PUBLICATIONS_BASE_URL', 'http://localhost:8083/api/v1/publications'),
  productsBaseUrl: urlFromEnv('PRODUCTS_BASE_URL', 'http://localhost:8080/api/v1/products'),
  usersBaseUrl: urlFromEnv('USERS_BASE_URL', 'http://localhost:8081/api/v1/users'),
  corsOrigins: listFromEnv('CORS_ORIGINS', ['http://localhost:4200']),
  azureTenantId: process.env.AZURE_TENANT_ID ?? '',
  azureClientId: process.env.AZURE_CLIENT_ID ?? '',
  // Solo desarrollo local: acepta X-User-* del cliente cuando no hay Bearer (ver authMiddleware.ts).
  allowUnverifiedIdentity: process.env.ALLOW_UNVERIFIED_IDENTITY === 'true',
  cacheTtlMs: numberFromEnv('CACHE_TTL_MS', 300_000),
  userCacheTtlMs: numberFromEnv('USER_CACHE_TTL_MS', 300_000),
  upstreamTimeoutMs: numberFromEnv('UPSTREAM_TIMEOUT_MS', 5_000),
  logFile: process.env.LOG_FILE || '',
  catalogPageSize: 100,
  
  // Hosts que va a llevar el SAN del certificado autofirmado (ver src/lib/tls.ts).
  // Agrega aquí la IP pública/privada actual del task de ECS si cambia.
  tlsHosts: (process.env.TLS_HOSTS || 'localhost,127.0.0.1,34.207.222.191,172.31.3.73')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
} as const;
