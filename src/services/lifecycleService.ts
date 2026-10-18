import { config } from '../config.js';
import { getOrder, refundOrder, releaseOrder } from '../lib/orders.js';
import { getPublication, updatePublicationStatus } from '../lib/publications.js';
import { logError } from '../lib/logger.js';
import { Inspection, PublicationStatus } from '../types.js';

/**
 * Qué pasa con la orden (payments) y la publicación (publication-service) cuando avanza la venta en el taller (reports):
 *
 *   rechazada → se REEMBOLSA la orden y recién después la publicación vuelve a ACTIVE.
 *               El orden importa: payments rechaza (409) comprar una publicación cuya orden sigue pagada; si solo volviera a ACTIVE
 *               aparecería en el catálogo pero nadie podría comprarla.
 *   entregada → se LIBERA el escrow al vendedor (orden COMPLETED) y la publicación pasa a SOLD.
 *               Si la liberación falla no se marca SOLD: el reintento (sync) repite ambos pasos.
 *
 * Todo es idempotente y devuelve avisos (texto para el admin) en vez de lanzar: reports ya guardó el cambio y no hay
 * transacción distribuida, así que si un paso falla se puede reintentar con POST /api/inspections/:id/sync.
 */
export interface LifecycleDeps {
  getPublicationStatus(publicationId: string): Promise<PublicationStatus>;
  setPublicationStatus(publicationId: string, status: PublicationStatus): Promise<unknown>;
  getOrderPaymentStatus(orderId: string): Promise<string>;
  refundOrder(orderId: string): Promise<unknown>;
  releaseOrder(orderId: string): Promise<unknown>;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createLifecycle(deps: LifecycleDeps) {
  /** Mueve la publicación de `from` a `to` solo si hoy está en `from` (no pisa un RETIRADA/VENDIDA puesto por otro camino). */
  async function moveIfCurrently(
    publicationId: string | null,
    from: PublicationStatus,
    to: PublicationStatus,
    warnings: string[],
  ): Promise<void> {
    if (!publicationId) return;
    try {
      const current = await deps.getPublicationStatus(publicationId);
      if (current === from) await deps.setPublicationStatus(publicationId, to);
    } catch (error) {
      logError(`[lifecycle] publicación ${publicationId} -> ${to}: ${message(error)}`);
      warnings.push(`No se pudo dejar la publicación en ${to}: ${message(error)}`);
    }
  }

  async function afterRejected(inspection: Inspection): Promise<string[]> {
    const warnings: string[] = [];
    try {
      const paymentStatus = await deps.getOrderPaymentStatus(inspection.orderId);
      if (paymentStatus === 'HOLD_ESCROW') {
        await deps.refundOrder(inspection.orderId);
      } else if (paymentStatus !== 'REFUNDED') {
        warnings.push(`La orden ${inspection.orderId} está en estado ${paymentStatus}: no se reembolsó.`);
        return warnings; // sin reembolso la pieza no se podría volver a comprar: no se repone
      }
    } catch (error) {
      logError(`[lifecycle] reembolso de ${inspection.orderId}: ${message(error)}`);
      warnings.push(`No se pudo reembolsar la orden ${inspection.orderId}: ${message(error)}`);
      return warnings;
    }
    await moveIfCurrently(inspection.publicationId, 'IN_INSPECTION', 'ACTIVE', warnings);
    return warnings;
  }

  async function afterDelivered(inspection: Inspection): Promise<string[]> {
    const warnings: string[] = [];
    try {
      const paymentStatus = await deps.getOrderPaymentStatus(inspection.orderId);
      if (paymentStatus === 'HOLD_ESCROW') {
        await deps.releaseOrder(inspection.orderId);
      } else if (paymentStatus !== 'RELEASED_TO_SELLER') {
        warnings.push(`La orden ${inspection.orderId} está en estado ${paymentStatus}: no se liberó el pago al vendedor.`);
        return warnings;
      }
    } catch (error) {
      logError(`[lifecycle] liberación de ${inspection.orderId}: ${message(error)}`);
      warnings.push(`No se pudo liberar el pago de la orden ${inspection.orderId}: ${message(error)}`);
      return warnings;
    }
    await moveIfCurrently(inspection.publicationId, 'IN_INSPECTION', 'SOLD', warnings);
    return warnings;
  }

  /** Reaplica, según el estado actual de la inspección, lo que corresponde a la orden y a la publicación. */
  async function reconcile(inspection: Inspection): Promise<string[]> {
    if (inspection.status === 'FAILED') return afterRejected(inspection);
    if (inspection.status === 'PASSED' && inspection.deliveredAt) return afterDelivered(inspection);
    return [];
  }

  return { afterRejected, afterDelivered, reconcile };
}

export const lifecycle = createLifecycle({
  getPublicationStatus: async (id) => (await getPublication(id)).status,
  setPublicationStatus: (id, status) => updatePublicationStatus(id, { status }, config.serviceIdentity),
  getOrderPaymentStatus: async (orderId) => (await getOrder(orderId)).paymentStatus,
  refundOrder,
  releaseOrder,
});
