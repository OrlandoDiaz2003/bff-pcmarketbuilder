import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { listInspections, resendNotifications } from '../lib/inspections.js';

/** Sustituye fetch y devuelve las llamadas hechas hacia reports. */
function stubFetch(payload: unknown) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}

const admin = { userId: 'admin-1', role: 'WORKSHOP_ADMIN' };

describe('correos de las inspecciones (BFF -> reports)', () => {
  afterEach(() => mock.restoreAll());

  it('lista las inspecciones con correos pendientes con el scope notifications y el rol del admin', async () => {
    const calls = stubFetch([{ id: 'i1', notifications: { confirmation: { status: 'FAILED', error: 'smtp' } } }]);
    const result = await listInspections(admin, 'notifications');
    assert.equal(result.length, 1);
    assert.match(calls[0].url, /\/inspections\?scope=notifications$/);
    assert.equal(calls[0].headers['X-User-Role'], 'WORKSHOP_ADMIN');
  });

  it('reenviar los correos hace POST a resend-notifications con el id codificado', async () => {
    const calls = stubFetch({ id: 'a/b', notifications: { confirmation: { status: 'PENDING', error: null } } });
    const result = await resendNotifications(admin, 'a/b');
    assert.equal(result.id, 'a/b');
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/inspections\/a%2Fb\/resend-notifications$/);
    assert.equal(calls[0].headers['X-User-Id'], 'admin-1');
  });
});
