import { config } from '../config.js';
import { getProduct } from '../lib/products.js';
import { EventEnvelope, TOPIC_AUDIT, TOPIC_BUSINESS, buildEnvelope, publish } from '../lib/kafka.js';
import { logError } from '../lib/logger.js';
import { Inspection, Order, Publication } from '../types.js';

export const NO_CATEGORY = 'SIN_CATEGORIA';

export interface CategoryRef {
  /** null si no se pudo resolver el producto. */
  id: string | null;
  name: string;
}

export interface EventDeps {
  publish(topic: string, key: string, envelope: EventEnvelope): void;
  /** Subcategoría del producto (Processors, Graphics Cards, RAM...). Nunca lanza: si falla devuelve SIN_CATEGORIA. */
  categoryOf(productId: string): Promise<CategoryRef>;
}

export interface SearchFilters {
  q?: string;
  brand?: string;
  subcategoryId?: string;
  socket?: string;
  sellerId?: string;
  grade?: string;
  maxPrice?: number;
}

/**
 * Eventos de negocio y de auditoría que el BFF publica en Kafka. Es el único productor: aquí se conoce al usuario real
 * (actorId), la pieza y su categoría. Todos los métodos son "dispara y sigue": no lanzan ni esperan a Kafka.
 * Nada de lo que sale lleva correos ni otros datos personales.
 */
export function createEventService(deps: EventDeps) {
  const business = (eventType: string, actorId: string | null | undefined, key: string, payload: Record<string, unknown>) =>
    deps.publish(TOPIC_BUSINESS, key, buildEnvelope(eventType, actorId, payload));
  const audit = (eventType: string, actorId: string | null | undefined, payload: Record<string, unknown>) =>
    deps.publish(TOPIC_AUDIT, actorId || 'anonymous', buildEnvelope(eventType, actorId, payload));

  /** Cada método atrapa cualquier error: una falla armando un evento jamás debe afectar a la operación de negocio. */
  const safely = (name: string, work: () => Promise<void> | void): Promise<void> =>
    Promise.resolve()
      .then(work)
      .catch((error: unknown) => logError(`[eventos] ${name}: ${(error as Error).message}`));

  const inspectionPayload = (i: Inspection) => ({
    inspectionId: i.id,
    orderId: i.orderId,
    orderItemId: i.orderItemId,
    publicationId: i.publicationId,
    sellerId: i.sellerId,
  });

  return {
    /** Compra pagada: un ítem por pieza, con su subcategoría (lo que necesita la analítica de ventas por categoría). */
    orderPaid(buyerId: string, order: Order, publications: Publication[]) {
      return safely('ORDER_PAID', async () => {
        const items = await Promise.all(
          publications.map(async (p) => {
            const category = await deps.categoryOf(p.productId);
            return {
              publicationId: p.publicationId,
              sellerId: p.sellerId,
              title: p.title,
              price: p.price,
              category: category.name,
              categoryId: category.id,
            };
          }),
        );
        business('ORDER_PAID', buyerId, order.orderId, {
          orderId: order.orderId,
          buyerId,
          totalAmount: items.reduce((sum, item) => sum + item.price, 0),
          items,
        });
      });
    },

    inspectionCompleted(adminId: string, i: Inspection) {
      return safely('INSPECTION_COMPLETED', () => {
        business('INSPECTION_COMPLETED', adminId, i.orderId, { ...inspectionPayload(i), inspectionStatus: i.status });
        audit(i.status === 'PASSED' ? 'INSPECTION_APPROVED' : 'INSPECTION_REJECTED', adminId, {
          ...inspectionPayload(i),
          inspectionStatus: i.status,
        });
      });
    },

    orderDelivered(adminId: string, i: Inspection) {
      return safely('ORDER_DELIVERED', () => {
        business('ORDER_DELIVERED', adminId, i.orderId, inspectionPayload(i));
        audit('PIECE_DELIVERED', adminId, inspectionPayload(i));
      });
    },

    orderCancelled(adminId: string, i: Inspection) {
      return safely('ORDER_CANCELLED', () => {
        business('ORDER_CANCELLED', adminId, i.orderId, inspectionPayload(i));
        audit('PURCHASE_CANCELLED', adminId, inspectionPayload(i));
      });
    },

    /** Reembolso hecho (por un rechazo o una cancelación). */
    orderRefunded(adminId: string, i: Inspection, reason: 'REJECTED' | 'CANCELLED') {
      return safely('ORDER_REFUNDED', () => {
        business('ORDER_REFUNDED', adminId, i.orderId, { ...inspectionPayload(i), reason });
        audit('ORDER_REFUNDED', adminId, { ...inspectionPayload(i), reason });
      });
    },

    notificationsResent(adminId: string, i: Inspection) {
      return safely('NOTIFICATIONS_RESENT', () => audit('NOTIFICATIONS_RESENT', adminId, inspectionPayload(i)));
    },

    notificationsDismissed(adminId: string, i: Inspection) {
      return safely('NOTIFICATIONS_DISMISSED', () => audit('NOTIFICATIONS_DISMISSED', adminId, inspectionPayload(i)));
    },

    publicationCreated(actorId: string | undefined, p: Publication) {
      return safely('PUBLICATION_CREATED', async () => {
        const category = await deps.categoryOf(p.productId);
        business('PUBLICATION_CREATED', actorId, p.publicationId, {
          publicationId: p.publicationId,
          sellerId: p.sellerId,
          productId: p.productId,
          price: p.price,
          grade: p.grade,
          category: category.name,
          categoryId: category.id,
        });
      });
    },

    /** Solo cuando hay texto o algún filtro: mirar el catálogo sin filtrar no es una búsqueda. */
    searchPerformed(actorId: string | undefined, filters: SearchFilters) {
      return safely('SEARCH_PERFORMED', () => {
        const used = Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ''),
        );
        if (Object.keys(used).length === 0) return;
        business('SEARCH_PERFORMED', actorId, actorId || 'anonymous', used);
      });
    },

    listingViewed(actorId: string | undefined, publicationId: string) {
      return safely('LISTING_VIEWED', () => business('LISTING_VIEWED', actorId, publicationId, { publicationId }));
    },
  };
}

// ---------------------------------------------------------------- dependencias reales
const categoryCache = new Map<string, { value: CategoryRef; at: number }>();

async function categoryOf(productId: string): Promise<CategoryRef> {
  const cached = categoryCache.get(productId);
  if (cached && Date.now() - cached.at < config.cacheTtlMs) return cached.value;
  try {
    const product = await getProduct(productId);
    const value = { id: product.subcategory.subcategoryId, name: product.subcategory.name };
    categoryCache.set(productId, { value, at: Date.now() });
    return value;
  } catch {
    return { id: null, name: NO_CATEGORY };
  }
}

export const events = createEventService({ publish, categoryOf });
