import { config } from '../config.js';
import { ConflictError } from '../errors.js';
import { listInspections } from '../lib/inspections.js';
import { log, logError } from '../lib/logger.js';
import { checkout as createCheckout, listOrdersByBuyer } from '../lib/orders.js';
import { getPublication, updatePublicationStatus } from '../lib/publications.js';
import { Order, OrderWithInspections } from '../types.js';

/**
 * Compra de una o más piezas. El orden importa:
 *  1. se validan las publicaciones (existen, ACTIVE, no son del comprador) y se toma el precio y el título REALES;
 *  2. payments cobra (pago simulado) y publica order.paid: es la autoridad de "esta pieza ya se vendió"
 *     (rechaza con 409 una pieza ya pagada), así que si falla no hay nada que revertir;
 *  3. recién ahí se pasan las publicaciones a IN_INSPECTION para sacarlas del catálogo.
 *     Si ese paso falla el pago ya está hecho: se registra el error y no se rompe la compra.
 */
export async function placeOrder(buyerId: string, publicationIds: string[], buyerEmail: string): Promise<Order> {
  const publications = await Promise.all(publicationIds.map((id) => getPublication(id)));

  for (const p of publications) {
    if (p.sellerId === buyerId) {
      throw new ConflictError(`No puedes comprar tu propia publicación: "${p.title}"`);
    }
    if (p.status !== 'ACTIVE') {
      throw new ConflictError(`La publicación "${p.title}" ya no está disponible`);
    }
  }

  const order = await createCheckout(buyerId, {
    buyerEmail,
    items: publications.map((p) => ({
      publicationId: p.publicationId,
      sellerId: p.sellerId,
      title: p.title,
      price: p.price,
    })),
  });
  log(`[orders] orden ${order.orderId} pagada por ${buyerId}: ${publicationIds.length} pieza(s)`);

  const results = await Promise.allSettled(
    publications.map((p) =>
      updatePublicationStatus(p.publicationId, { status: 'IN_INSPECTION' }, config.serviceIdentity),
    ),
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logError(
        `[orders] orden ${order.orderId}: no se pudo pasar ${publications[index].publicationId} a IN_INSPECTION: ` +
          `${(result.reason as Error).message}`,
      );
    }
  });
  return order;
}

/** "Mis compras": las órdenes del comprador con el estado de la revisión técnica de cada pieza. */
export async function listMyOrders(buyerId: string): Promise<OrderWithInspections[]> {
  const [orders, inspections] = await Promise.all([
    listOrdersByBuyer(buyerId),
    // si reports no responde, las compras igual se muestran (sin estado de revisión)
    listInspections({ userId: buyerId }, 'buyer').catch(() => []),
  ]);
  const byItem = new Map(inspections.map((i) => [i.orderItemId, i]));
  return orders
    .filter((o) => o.paymentStatus !== 'PENDING')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((o) => ({
      ...o,
      items: o.items.map((item) => {
        const inspection = byItem.get(item.orderItemId);
        return {
          ...item,
          inspection: inspection
            ? { status: inspection.status, completedAt: inspection.completedAt, deliveredAt: inspection.deliveredAt }
            : null,
        };
      }),
    }));
}
