import { config } from '../config.js';
import { BinaryResponse, requestBuffer } from './http.js';
import { InspectionAuth } from './inspections.js';

/** PDF del informe técnico de una pieza. reports valida que sea el comprador, el vendedor o un admin. */
export function downloadReport(auth: InspectionAuth, orderItemId: string): Promise<BinaryResponse> {
  // Aceptar también JSON: si solo se pide PDF, Spring no puede renderizar el error (404/403) y responde 500.
  const headers: Record<string, string> = { Accept: 'application/pdf, application/json' };
  if (auth.userId) headers['X-User-Id'] = auth.userId;
  if (auth.role) headers['X-User-Role'] = auth.role;
  return requestBuffer(`${config.reportsBaseUrl}/reports/${encodeURIComponent(orderItemId)}`, { headers });
}
