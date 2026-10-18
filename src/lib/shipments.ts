import { Request } from 'express';
import { config } from '../config.js';
import { requestJson } from './http.js';
import { identityHeaders } from './upstream.js';

/** Reenvía la request a ms-shipments con la identidad ya validada por authMiddleware. */ 
export function forwardToShipments<T = unknown>(req: Request, path: string): Promise<T> {
  const hasBody = req.method !== 'GET' && req.method !== 'DELETE' && req.body !== undefined;
  return requestJson<T>(`${config.shipmentsBaseUrl}${path}`, {
    method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    headers: identityHeaders(req),
    body: hasBody ? req.body : undefined,
  });
}
