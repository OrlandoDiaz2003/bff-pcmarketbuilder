import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Seller } from '../types.js';
import { withActorNames, withSellerNames } from './analyticsService.js';

const seller = (username: string) => ({ username }) as unknown as Seller;
const lookup = async (id: string) => (id === 'oid-ana' ? seller('ana') : null);

describe('nombres en la analítica', () => {
  it('cambia el id del vendedor por su nombre de usuario y deja el id si no existe', async () => {
    const rows = await withSellerNames(
      [{ key: 'oid-ana', label: 'oid-ana', count: 3, amount: 100 }, { key: 'oid-x', label: 'oid-x', count: 1, amount: 5 }],
      lookup,
    );
    assert.deepEqual(rows.map((r) => r.label), ['ana', 'oid-x']);
    assert.deepEqual(rows.map((r) => r.amount), [100, 5]); // las cifras no se tocan
  });

  it('si la consulta del usuario falla, la fila igual sale', async () => {
    const rows = await withSellerNames([{ key: 'k', label: null, count: 1, amount: 0 }], async () => { throw new Error('ms-user caído'); });
    assert.equal(rows[0].label, 'k');
  });

  it('la auditoría suma actorName y consulta una sola vez por actor', async () => {
    let calls = 0;
    const counting = async (id: string) => { calls += 1; return lookup(id); };
    const base = { eventId: 'e', source: 'bff', occurredAt: '2026-11-12T10:00:00Z', payload: null };
    const rows = await withActorNames(
      [
        { ...base, eventType: 'PIECE_DELIVERED', actorId: 'oid-ana' },
        { ...base, eventType: 'INSPECTION_APPROVED', actorId: 'oid-ana' },
        { ...base, eventType: 'LISTING_VIEWED', actorId: null },
        { ...base, eventType: 'X', actorId: 'oid-x' },
      ],
      counting,
    );
    assert.deepEqual(rows.map((r) => r.actorName), ['ana', 'ana', null, null]);
    assert.equal(calls, 2);
  });
});
