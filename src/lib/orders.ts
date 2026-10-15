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

export function listOrdersByBuyer(buyerId: string): Promise<Order[]> {
  return requestJson<Order[]>(`${config.paymentsBaseUrl}${buildQuery({ buyerId })}`);
}
