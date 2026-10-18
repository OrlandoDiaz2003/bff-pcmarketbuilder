import { Request } from 'express';
import { config } from '../config.js';
import { UpstreamError } from '../errors.js';
import { requestJson } from './http.js';

const IDENTITY_HEADERS = ['x-user-id', 'x-user-role', 'x-user-email', 'x-user-name'] as const;

/** Identidad ya validada por authMiddleware, lista para reenviar a un microservicio. */
export function identityHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of IDENTITY_HEADERS) {
    const value = req.header(name);
    if (value) headers[name] = value;
  }
  return headers;
}

export function isAgent(req: Request): boolean {
  return req.header('x-user-role') === 'WORKSHOP_ADMIN';
}

export function callUpstream<T>(
  req: Request,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  return requestJson<T>(url, { method, headers: identityHeaders(req), body });
}

/** Descarga binaria (PDF) desde un microservicio, reenviando la identidad. */
export async function fetchBinary(
  req: Request,
  url: string,
): Promise<{ buffer: Buffer; contentType: string; disposition: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.upstreamTimeoutMs * 2);
  let response: Response;
  try {
    response = await fetch(url, { headers: identityHeaders(req), signal: controller.signal });
  } catch {
    throw new UpstreamError(`No se pudo contactar el microservicio upstream: ${url}`, 0);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let message = `El microservicio upstream respondió ${response.status} en ${url}`;
    try {
      const parsed = JSON.parse(await response.text()) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      // cuerpo no JSON: se deja el mensaje genérico
    }
    throw new UpstreamError(message, response.status);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/pdf',
    disposition: response.headers.get('content-disposition'),
  };
}
