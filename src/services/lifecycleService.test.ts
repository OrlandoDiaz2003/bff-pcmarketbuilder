import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Inspection, PublicationStatus } from '../types.js';
import { createLifecycle } from './lifecycleService.js';

function inspection(patch: Partial<Inspection> = {}): Inspection {
  return {
    id: 'i1', orderId: 'o1', orderItemId: 'it1', publicationId: 'p1', description: 'RTX', buyerId: 'b',
    buyerEmail: 'b@x.cl', sellerId: 's', status: 'FAILED', agentId: 'a', maintenanceDone: 'x', maintenanceDate: null,
    workshopNotes: null, checks: [], completedAt: null, deliveredAt: null, createdAt: '2026-10-18T00:00:00Z', ...patch,
  };
}

function setup(
  opts: { payment?: string; publication?: PublicationStatus; refundFails?: boolean; releaseFails?: boolean; setFails?: boolean } = {},
) {
  const calls: string[] = [];
  const lifecycle = createLifecycle({
    getOrderPaymentStatus: async () => {
      calls.push('getOrder');
      return opts.payment ?? 'HOLD_ESCROW';
    },
    refundOrder: async () => {
      calls.push('refund');
      if (opts.refundFails) throw new Error('payments caído');
    },
    releaseOrder: async () => {
      calls.push('release');
      if (opts.releaseFails) throw new Error('payments caído');
    },
    getPublicationStatus: async () => {
      calls.push('getPublication');
      return opts.publication ?? 'IN_INSPECTION';
    },
    setPublicationStatus: async (_id, status) => {
      calls.push(`setPublication:${status}`);
      if (opts.setFails) throw new Error('publication caído');
    },
  });
  return { lifecycle, calls };
}

describe('ciclo de vida de la venta (orden + publicación)', () => {
  it('rechazada: primero REEMBOLSA la orden y recién después repone la publicación a ACTIVE', async () => {
    const t = setup();
    const warnings = await t.lifecycle.afterRejected(inspection());
    assert.deepEqual(warnings, []);
    assert.deepEqual(t.calls, ['getOrder', 'refund', 'getPublication', 'setPublication:ACTIVE']);
  });

  it('rechazada es idempotente: si la orden ya estaba reembolsada no vuelve a reembolsar', async () => {
    const t = setup({ payment: 'REFUNDED' });
    assert.deepEqual(await t.lifecycle.afterRejected(inspection()), []);
    assert.ok(!t.calls.includes('refund'));
    assert.ok(t.calls.includes('setPublication:ACTIVE'));
  });

  it('si el reembolso falla avisa y NO repone la publicación (quedaría visible pero imposible de comprar)', async () => {
    const t = setup({ refundFails: true });
    const warnings = await t.lifecycle.afterRejected(inspection());
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /No se pudo reembolsar/);
    assert.ok(!t.calls.some((c) => c.startsWith('setPublication')));
  });

  it('si la orden está en un estado que no se puede reembolsar (p. ej. ya liberada) avisa y no repone', async () => {
    const t = setup({ payment: 'RELEASED_TO_SELLER' });
    const warnings = await t.lifecycle.afterRejected(inspection());
    assert.match(warnings[0], /RELEASED_TO_SELLER/);
    assert.ok(!t.calls.includes('refund'));
    assert.ok(!t.calls.some((c) => c.startsWith('setPublication')));
  });

  it('no pisa una publicación que ya no está en inspección (p. ej. la retiró el vendedor)', async () => {
    const t = setup({ publication: 'WITHDRAWN' });
    assert.deepEqual(await t.lifecycle.afterRejected(inspection()), []);
    assert.ok(!t.calls.some((c) => c.startsWith('setPublication')));
  });

  it('si no se puede actualizar la publicación lo informa en vez de romper', async () => {
    const t = setup({ setFails: true });
    const warnings = await t.lifecycle.afterRejected(inspection());
    assert.match(warnings[0], /No se pudo dejar la publicación en ACTIVE/);
  });

  it('sin publicación (borrada) igual reembolsa y no intenta tocarla', async () => {
    const t = setup();
    assert.deepEqual(await t.lifecycle.afterRejected(inspection({ publicationId: null })), []);
    assert.ok(t.calls.includes('refund'));
    assert.ok(!t.calls.includes('getPublication'));
  });

  it('entregada: primero LIBERA el escrow al vendedor y después marca la publicación SOLD', async () => {
    const t = setup();
    assert.deepEqual(await t.lifecycle.afterDelivered(inspection({ status: 'PASSED' })), []);
    assert.deepEqual(t.calls, ['getOrder', 'release', 'getPublication', 'setPublication:SOLD']);
  });

  it('entregada es idempotente: orden ya liberada y publicación ya SOLD no repiten nada', async () => {
    const t = setup({ payment: 'RELEASED_TO_SELLER', publication: 'SOLD' });
    assert.deepEqual(await t.lifecycle.afterDelivered(inspection({ status: 'PASSED' })), []);
    assert.ok(!t.calls.includes('release'));
    assert.ok(!t.calls.some((c) => c.startsWith('setPublication')));
  });

  it('si la liberación falla avisa y NO marca SOLD (el reintento repite ambos pasos)', async () => {
    const t = setup({ releaseFails: true });
    const warnings = await t.lifecycle.afterDelivered(inspection({ status: 'PASSED' }));
    assert.match(warnings[0], /No se pudo liberar/);
    assert.ok(!t.calls.some((c) => c.startsWith('setPublication')));
  });

  it('si la orden está en un estado que no se puede liberar (p. ej. reembolsada) avisa y no marca SOLD', async () => {
    const t = setup({ payment: 'REFUNDED' });
    const warnings = await t.lifecycle.afterDelivered(inspection({ status: 'PASSED' }));
    assert.match(warnings[0], /REFUNDED/);
    assert.ok(!t.calls.includes('release'));
    assert.ok(!t.calls.some((c) => c.startsWith('setPublication')));
  });

  it('reconcile reaplica según el estado actual de la inspección', async () => {
    const rejected = setup();
    await rejected.lifecycle.reconcile(inspection({ status: 'FAILED' }));
    assert.ok(rejected.calls.includes('refund'));

    const delivered = setup();
    await delivered.lifecycle.reconcile(inspection({ status: 'PASSED', deliveredAt: '2026-10-18T01:00:00Z' }));
    assert.ok(delivered.calls.includes('release'));
    assert.ok(delivered.calls.includes('setPublication:SOLD'));

    for (const patch of [{ status: 'PASSED' as const }, { status: 'PENDING' as const }, { status: 'IN_REVIEW' as const }]) {
      const idle = setup();
      assert.deepEqual(await idle.lifecycle.reconcile(inspection(patch)), []);
      assert.deepEqual(idle.calls, [], `sin cambios para ${patch.status}`);
    }
  });
});
