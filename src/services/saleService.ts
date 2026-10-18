import { listSales } from '../lib/inspections.js';
import { getPublication } from '../lib/publications.js';
import { Publication, SaleRecord, SaleStage, SaleView, Seller } from '../types.js';
import { lookupSeller } from './catalogService.js';

/** Etapa de la venta para el vendedor, a partir del estado de la inspección. */
export function stageOf(sale: Pick<SaleRecord, 'status' | 'deliveredAt'>): SaleStage {
  switch (sale.status) {
    case 'PENDING':
      return 'PAID';
    case 'IN_REVIEW':
      return 'IN_REVIEW';
    case 'FAILED':
      return 'REJECTED';
    case 'PASSED':
      return sale.deliveredAt ? 'DELIVERED' : 'APPROVED';
  }
}

/**
 * Arma lo que ve el vendedor. Es una lista blanca explícita: aunque reports mande más campos (buyerId), NO se copian
 * correo, id del comprador ni notas del taller. Del comprador solo sale su nombre de usuario público.
 */
export function toSaleView(sale: SaleRecord, publication: Publication | null, buyer: Seller | null): SaleView {
  const image = publication?.images.find((i) => i.isPrimary) ?? publication?.images[0];
  return {
    id: sale.id,
    orderItemId: sale.orderItemId,
    publicationId: sale.publicationId,
    title: publication?.title ?? sale.description ?? 'Pieza',
    price: publication?.price ?? null,
    image: image?.imageUrl ?? null,
    publicationStatus: publication?.status ?? null,
    stage: stageOf(sale),
    buyerUsername: buyer?.username ?? null,
    paidAt: sale.createdAt,
    reviewedAt: sale.completedAt,
    deliveredAt: sale.deliveredAt,
  };
}

/** "Mis ventas": las ventas del usuario con la pieza y el nombre del comprador. Si algo falla al enriquecer, la fila igual sale. */
export async function listMySales(sellerId: string): Promise<SaleView[]> {
  const sales = await listSales({ userId: sellerId });
  return Promise.all(
    sales.map(async (sale) => {
      const [publication, buyer] = await Promise.all([
        sale.publicationId ? getPublication(sale.publicationId).catch(() => null) : null,
        sale.buyerId ? lookupSeller(sale.buyerId).catch(() => null) : null,
      ]);
      return toSaleView(sale, publication, buyer);
    }),
  );
}
