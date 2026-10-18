import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Publication, SaleRecord } from '../types.js';
import { stageOf, toSaleView } from './saleService.js';

const sale = (patch: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 'i1', orderId: 'o-secreta', orderItemId: 'it1', publicationId: 'p1', description: 'RTX 4070 usada',
  buyerId: 'oid-comprador-123', status: 'PENDING', completedAt: null, deliveredAt: null,
  createdAt: '2026-10-18T10:00:00Z', ...patch,
});

const publication = (patch: Partial<Publication> = {}): Publication => ({
  publicationId: 'p1', sellerId: 's', productId: 'prod', title: 'RTX 4070', description: null, price: 450000,
  grade: 'GRADE_B', usageTimeMonths: 6, status: 'IN_INSPECTION', createdAt: '2026-10-01T00:00:00Z',
  images: [
    { imageId: 'a', imageUrl: 'https://x/segunda.jpg', isPrimary: false },
    { imageId: 'b', imageUrl: 'https://x/principal.jpg', isPrimary: true },
  ],
  ...patch,
});

describe('etapas de una venta (stageOf)', () => {
  it('traduce el estado de la inspección a la etapa que ve el vendedor', () => {
    assert.equal(stageOf({ status: 'PENDING', deliveredAt: null }), 'PAID');
    assert.equal(stageOf({ status: 'IN_REVIEW', deliveredAt: null }), 'IN_REVIEW');
    assert.equal(stageOf({ status: 'PASSED', deliveredAt: null }), 'APPROVED');
    assert.equal(stageOf({ status: 'PASSED', deliveredAt: '2026-10-18T12:00:00Z' }), 'DELIVERED');
    assert.equal(stageOf({ status: 'FAILED', deliveredAt: null }), 'REJECTED');
  });
});

describe('vista del vendedor (toSaleView)', () => {
  it('muestra la pieza, la foto principal y SOLO el nombre de usuario del comprador', () => {
    const view = toSaleView(sale({ status: 'PASSED' }), publication(), { username: 'pansito', avatarUrl: null, bio: null });
    assert.equal(view.title, 'RTX 4070');
    assert.equal(view.price, 450000);
    assert.equal(view.image, 'https://x/principal.jpg');
    assert.equal(view.buyerUsername, 'pansito');
    assert.equal(view.stage, 'APPROVED');
    assert.equal(view.publicationStatus, 'IN_INSPECTION');
  });

  it('NO filtra el id del comprador, ni el id de la orden, ni correos o notas', () => {
    const view = toSaleView(sale({ status: 'FAILED' }), publication(), { username: 'pansito', avatarUrl: null, bio: null });
    const json = JSON.stringify(view);
    for (const secret of ['oid-comprador-123', 'o-secreta', 'buyerId', 'orderId', 'buyerEmail', 'workshopNotes', 'maintenance']) {
      assert.ok(!json.includes(secret), `no debe contener ${secret}`);
    }
  });

  it('si la publicación o el comprador no existen la fila igual sale, con valores de respaldo', () => {
    const view = toSaleView(sale(), null, null);
    assert.equal(view.title, 'RTX 4070 usada');
    assert.equal(view.price, null);
    assert.equal(view.image, null);
    assert.equal(view.publicationStatus, null);
    assert.equal(view.buyerUsername, null);
  });

  it('una pieza rechazada que volvió al catálogo se ve como REJECTED con la publicación ACTIVE', () => {
    const view = toSaleView(sale({ status: 'FAILED' }), publication({ status: 'ACTIVE' }), null);
    assert.equal(view.stage, 'REJECTED');
    assert.equal(view.publicationStatus, 'ACTIVE');
  });
});
