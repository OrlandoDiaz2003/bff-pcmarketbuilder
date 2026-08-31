import { config } from '../config.js';
import { UpstreamError } from '../errors.js';

export type QueryParams = Record<string, string | number | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

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

function messageFromErrorBody(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const msg = (body as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;

    const raw = body as Record<string, unknown>;
    const keys = Object.keys(raw);
    if (keys.length > 0 && keys.every((key) => typeof raw[key] === 'string')) {
      return keys.map((key) => `${key}: ${raw[key]}`).join('; ');
    }
  }
  return null;
}

export async function requestJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', headers, body, timeoutMs = config.upstreamTimeoutMs } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new UpstreamError(`No se pudo contactar el microservicio upstream: ${url}`, 0);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const raw = await response.text();
    let parsed: unknown;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      parsed = raw;
    }
    const upstreamMessage = messageFromErrorBody(parsed);
    throw new UpstreamError(
      upstreamMessage ?? `El microservicio upstream respondió ${response.status} en ${url}`,
      response.status,
      parsed,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}