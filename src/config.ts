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

export const config = {
  port: numberFromEnv('PORT', 4000),
  publicationsBaseUrl: urlFromEnv('PUBLICATIONS_BASE_URL', 'http://localhost:8083/api/publications'),
  productsBaseUrl: urlFromEnv('PRODUCTS_BASE_URL', 'http://localhost:8080/api/v1/products'),
  cacheTtlMs: numberFromEnv('CACHE_TTL_MS', 300_000),
  upstreamTimeoutMs: numberFromEnv('UPSTREAM_TIMEOUT_MS', 5_000),
  catalogPageSize: 100,
} as const;