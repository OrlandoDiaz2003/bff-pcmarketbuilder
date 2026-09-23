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
  (process.env[name] ?? fallback).replace(/\/+\$/, '');

// 2. Base URL construida a partir de la API Gateway (opcional, por si la necesitas en el objeto config)
const apiGatewayUrl = process.env.API_GATEWAY_URL || '';

// 3. Exportación única del objeto de configuración
export const config = {
  port: numberFromEnv('PORT', 4000),
  httpsPort: numberFromEnv('HTTPS_PORT', 4444),
  
  // Apis usando las funciones utilitarias o API Gateway como fallback
  publicationsBaseUrl: urlFromEnv('PUBLICATIONS_BASE_URL', `${apiGatewayUrl}/publicacion/api/v1/publications`),
  productsBaseUrl: urlFromEnv('PRODUCTS_BASE_URL', `${apiGatewayUrl}/producto/api/v1/products`),
  usersBaseUrl: urlFromEnv('USERS_BASE_URL', `${apiGatewayUrl}/usuarios/api/v1/users`),
  
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
