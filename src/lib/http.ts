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
    const raw = body as Record<string, unknown>;
    const msg = raw.message;
    if (typeof msg === 'string' && msg.length > 0) return msg;

    // Spring responde {timestamp, status, error, path} sin campo `message`
    // cuando la validación ocurre fuera de un @RestControllerAdvice.
    const err = raw.error;
    if (typeof err === 'string' && err.length > 0) {
      const path = raw.path;
      return typeof path === 'string' && path.length > 0
        ? `${err} (${path})`
        : err;
    }

    const keys = Object.keys(raw);
    if (keys.length > 0 && keys.every((key) => typeof raw[key] === 'string')) {
      return keys.map((key) => `${key}: ${raw[key]}`).join('; ');
    }
  }
  return null;
}

async function fetchOk(url: string, options: RequestOptions): Promise<Response> {
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

  return response;
}

export async function requestJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetchOk(url, options);
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export interface BinaryResponse {
  body: Buffer;
  contentType: string;
  contentDisposition: string | null;
}

/** Para respuestas no JSON (PDF). El llamador debe pasar el header Accept adecuado. */
export async function requestBuffer(
  url: string,
  options: RequestOptions = {},
): Promise<BinaryResponse> {
  const response = await fetchOk(url, options);
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    contentDisposition: response.headers.get('content-disposition'),
  };
}