import { config } from '../config.js';
import { Order } from '../types.js';
import { buildQuery, requestJson } from './http.js';

export interface CheckoutItem {
  publicationId: string;
  sellerId: string;
  title: string;
  price: number;
}

export interface CheckoutRequest {
  buyerEmail: string;
  items: CheckoutItem[];
}

/** El comprador viaja en X-User-Id (payments no lo toma del body). */
export function checkout(buyerId: string, body: CheckoutRequest): Promise<Order> {
  return requestJson<Order>(`${config.paymentsBaseUrl}/checkout`, {
    method: 'POST',
    headers: { 'X-User-Id': buyerId },
    body,
  });
}

export function getOrder(orderId: string): Promise<Order> {
  return requestJson<Order>(`${config.paymentsBaseUrl}/${encodeURIComponent(orderId)}`);
}

/** Reembolsa la orden (payments exige WORKSHOP_ADMIN): se usa con la identidad de servicio del BFF. */
export function refundOrder(orderId: string): Promise<Order> {
  return requestJson<Order>(`${config.paymentsBaseUrl}/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
    headers: { 'X-User-Id': config.serviceIdentity.userId, 'X-User-Role': config.serviceIdentity.role },
  });
}

/** Libera el escrow al vendedor al entregar la pieza (payments exige WORKSHOP_ADMIN): identidad de servicio del BFF. */
export function releaseOrder(orderId: string): Promise<Order> {
  return requestJson<Order>(`${config.paymentsBaseUrl}/${encodeURIComponent(orderId)}/release`, {
    method: 'POST',
    headers: { 'X-User-Id': config.serviceIdentity.userId, 'X-User-Role': config.serviceIdentity.role },
  });
}

export function listOrdersByBuyer(buyerId: string): Promise<Order[]> {
  return requestJson<Order[]>(`${config.paymentsBaseUrl}${buildQuery({ buyerId })}`);
}
