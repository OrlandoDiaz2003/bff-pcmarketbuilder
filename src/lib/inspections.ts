import { config } from '../config.js';
import { Inspection, SaleRecord } from '../types.js';
import { requestJson } from './http.js';

export interface InspectionAuth {
  userId?: string;
  role?: string;
}

export interface CompleteInspectionRequest {
  result: 'PASSED' | 'FAILED';
  maintenanceDone: string;
  maintenanceDate?: string;
  notes?: string;
  checks?: Array<{ component: string; result: 'OK' | 'WARNING' | 'FAIL'; note?: string }>;
}

function headers(auth: InspectionAuth): Record<string, string> {
  const h: Record<string, string> = {};
  if (auth.userId) h['X-User-Id'] = auth.userId;
  if (auth.role) h['X-User-Role'] = auth.role;
  return h;
}

/** scope: open = bandeja del admin, to-deliver = aprobadas sin entregar (admin), mine = las que cerró el admin, buyer = compras del usuario. */
export function listInspections(
  auth: InspectionAuth,
  scope: 'open' | 'to-deliver' | 'mine' | 'buyer',
): Promise<Inspection[]> {
  return requestJson<Inspection[]>(`${config.reportsBaseUrl}/inspections?scope=${scope}`, {
    headers: headers(auth),
  });
}

export function getInspection(auth: InspectionAuth, id: string): Promise<Inspection> {
  return requestJson<Inspection>(`${config.reportsBaseUrl}/inspections/${encodeURIComponent(id)}`, {
    headers: headers(auth),
  });
}

export function completeInspection(
  auth: InspectionAuth,
  id: string,
  body: CompleteInspectionRequest,
): Promise<Inspection> {
  return requestJson<Inspection>(`${config.reportsBaseUrl}/inspections/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    headers: headers(auth),
    body,
  });
}


/** Ventas del vendedor (formato reducido). */
export function listSales(auth: InspectionAuth): Promise<SaleRecord[]> {
  return requestJson<SaleRecord[]>(`${config.reportsBaseUrl}/inspections?scope=seller`, { headers: headers(auth) });
}

/** El taller entrega la pieza aprobada. Idempotente en reports. */
export function deliverInspection(auth: InspectionAuth, id: string): Promise<Inspection> {
  return requestJson<Inspection>(`${config.reportsBaseUrl}/inspections/${encodeURIComponent(id)}/deliver`, {
    method: 'POST',
    headers: headers(auth),
  });
}
