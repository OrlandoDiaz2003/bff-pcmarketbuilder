import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventEnvelope } from '../lib/kafka.js';
import { Inspection, Order, Publication } from '../types.js';
import { CategoryRef, createEventService } from './eventService.js';

type Sent = { topic: string; key: string; envelope: EventEnvelope };

function setup(categoryOf: (productId: string) => Promise<CategoryRef> = async () => ({ id: 'sc-1', name: 'Graphics Cards' })) {
  const sent: Sent[] = [];
  const service = createEventService({ publish: (topic, key, envelope) => void sent.push({ topic, key, envelope }), categoryOf });
  return { service, sent };
}

const order = { orderId: 'o1', buyerEmail: 'comprador@correo.cl' } as unknown as Order;
const pub = (n: number, price: number): Publication =>
  ({ publicationId: `p${n}`, sellerId: 's1', productId: `prod${n}`, title: `Pieza ${n}`, price, grade: 'GRADE_A' }) as unknown as Publication;
const inspection = (status: Inspection['status']): Inspection =>
  ({ id: 'i1', orderId: 'o1', orderItemId: 'it1', publicationId: 'p1', sellerId: 's1', status, buyerEmail: 'comprador@correo.cl' }) as unknown as Inspection;

describe('ORDER_PAID', () => {
  it('lleva un ítem por pieza con su subcategoría, el total y la clave orderId', async () => {
    const { service, sent } = setup();
    await service.orderPaid('buyer-1', order, [pub(1, 450000), pub(2, 120000)]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].topic, 'pcb.business.events');
    assert.equal(sent[0].key, 'o1');
    const { eventType, actorId, payload } = sent[0].envelope;
    assert.equal(eventType, 'ORDER_PAID');
    assert.equal(actorId, 'buyer-1');
    const items = payload.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], {
      publicationId: 'p1', sellerId: 's1', title: 'Pieza 1', price: 450000, category: 'Graphics Cards', categoryId: 'sc-1',
    });
    assert.equal(payload.totalAmount, 570000);
  });

  it('si no se puede resolver la categoría el evento sale igual con SIN_CATEGORIA', async () => {
    const { service, sent } = setup(async () => ({ id: null, name: 'SIN_CATEGORIA' }));
    await service.orderPaid('buyer-1', order, [pub(1, 1000)]);
    const items = sent[0].envelope.payload.items as Array<Record<string, unknown>>;
    assert.equal(items[0].category, 'SIN_CATEGORIA');
    assert.equal(items[0].categoryId, null);
  });

  it('no lleva el correo del comprador ni otros datos personales', async () => {
    const { service, sent } = setup();
    await service.orderPaid('buyer-1', order, [pub(1, 1000)]);
    assert.ok(!JSON.stringify(sent[0].envelope).includes('comprador@correo.cl'));
  });

  it('si armar el evento falla no lanza (la compra no se puede ver afectada)', async () => {
    const { service, sent } = setup(async () => { throw new Error('product-service caído'); });
    await assert.doesNotReject(service.orderPaid('buyer-1', order, [pub(1, 1000)]));
    assert.equal(sent.length, 0);
  });
});

describe('inspecciones y auditoría', () => {
  it('cerrar una inspección publica el evento de negocio y la auditoría con el admin como actor', async () => {
    const { service, sent } = setup();
    await service.inspectionCompleted('admin-1', inspection('PASSED'));
    assert.deepEqual(sent.map((s) => [s.topic, s.envelope.eventType, s.envelope.actorId]), [
      ['pcb.business.events', 'INSPECTION_COMPLETED', 'admin-1'],
      ['pcb.audit.events', 'INSPECTION_APPROVED', 'admin-1'],
    ]);
    assert.equal(sent[0].envelope.payload.inspectionStatus, 'PASSED');
    assert.equal(sent[1].key, 'admin-1');
    await service.inspectionCompleted('admin-1', inspection('FAILED'));
    assert.equal(sent[3].envelope.eventType, 'INSPECTION_REJECTED');
  });

  it('entrega, cancelación, reembolso y reenvío dejan rastro de quién lo hizo', async () => {
    const { service, sent } = setup();
    await service.orderDelivered('admin-1', inspection('PASSED'));
    await service.orderCancelled('admin-1', inspection('PASSED'));
    await service.orderRefunded('admin-1', inspection('CANCELLED'), 'CANCELLED');
    await service.notificationsResent('admin-1', inspection('PASSED'));
    await service.notificationsDismissed('admin-1', inspection('PASSED'));
    const audits = sent.filter((s) => s.topic === 'pcb.audit.events').map((s) => s.envelope.eventType);
    assert.deepEqual(audits, ['PIECE_DELIVERED', 'PURCHASE_CANCELLED', 'ORDER_REFUNDED', 'NOTIFICATIONS_RESENT', 'NOTIFICATIONS_DISMISSED']);
    assert.ok(sent.every((s) => !JSON.stringify(s.envelope).includes('comprador@correo.cl')));
    assert.equal(sent.find((s) => s.envelope.eventType === 'ORDER_REFUNDED')?.envelope.payload.reason, 'CANCELLED');
  });
});

describe('actividad del catálogo', () => {
  it('una publicación creada lleva su subcategoría', async () => {
    const { service, sent } = setup();
    await service.publicationCreated('seller-1', pub(1, 25000));
    assert.equal(sent[0].envelope.eventType, 'PUBLICATION_CREATED');
    assert.equal(sent[0].key, 'p1');
    assert.equal(sent[0].envelope.payload.category, 'Graphics Cards');
  });

  it('una búsqueda solo se publica si trae texto o filtros, y solo con los usados', async () => {
    const { service, sent } = setup();
    await service.searchPerformed('u1', {});
    await service.searchPerformed('u1', { q: '', brand: undefined });
    assert.equal(sent.length, 0);
    await service.searchPerformed(undefined, { q: 'rtx', maxPrice: 300000, brand: '' });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].envelope.payload, { q: 'rtx', maxPrice: 300000 });
    assert.equal(sent[0].envelope.actorId, null); // anónimo
    assert.equal(sent[0].key, 'anonymous');
  });

  it('ver una pieza publica LISTING_VIEWED con la publicación como clave', async () => {
    const { service, sent } = setup();
    await service.listingViewed('u1', 'p9');
    assert.equal(sent[0].envelope.eventType, 'LISTING_VIEWED');
    assert.equal(sent[0].key, 'p9');
  });
});
