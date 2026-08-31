import { config } from '../config.js';
import { UpstreamError } from '../errors.js';

export type QueryParams = Record<string, string | number | undefined | null>;

export function buildQuery(params: QueryParams): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams();
  for (const [key, value] of entries) {
    qs.set(key, String(value));
  }
  return `?${qs.toString()}`;
}

export async function requestJson<T>(
  url: string,
  timeoutMs: number = config.upstreamTimeoutMs,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new UpstreamError(`No se pudo contactar el microservicio upstream: ${url}`, 0);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const raw = await response.text();
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    throw new UpstreamError(
      `El microservicio upstream respondió ${response.status} en ${url}`,
      response.status,
      body,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}