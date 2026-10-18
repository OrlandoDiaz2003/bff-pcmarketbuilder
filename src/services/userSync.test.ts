import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUserSync } from './userSync.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const user = { userId: 'oid-1', role: 'BUYER_SELLER', email: 'a@b.cl', name: 'Ana' };

function setup(sync: (auth: unknown) => Promise<unknown> = () => Promise.resolve()) {
  let now = 1_000;
  const calls: unknown[] = [];
  const synced: string[] = [];
  const ensure = createUserSync({
    sync: (auth) => {
      calls.push(auth);
      return sync(auth);
    },
    now: () => now,
    ttlMs: 10_000,
    retryMs: 500,
    onSynced: (oid) => synced.push(oid),
  });
  return { ensure, calls, synced, advance: (ms: number) => (now += ms) };
}

describe('alta automática del usuario (userSync)', () => {
  it('sincroniza en la primera petición y no repite dentro de la ventana', async () => {
    const t = setup();
    t.ensure(user);
    await tick();
    t.ensure(user);
    t.ensure(user);
    await tick();
    assert.equal(t.calls.length, 1);
    assert.deepEqual(t.calls[0], user);
    assert.deepEqual(t.synced, ['oid-1']);
  });

  it('vuelve a sincronizar cuando vence la ventana (refresca rol/correo/nombre)', async () => {
    const t = setup();
    t.ensure(user);
    await tick();
    t.advance(10_001);
    t.ensure(user);
    await tick();
    assert.equal(t.calls.length, 2);
  });

  it('peticiones simultáneas del mismo usuario comparten una sola llamada', async () => {
    let release!: () => void;
    const t = setup(() => new Promise<void>((resolve) => (release = resolve)));
    t.ensure(user);
    t.ensure(user);
    t.ensure(user);
    assert.equal(t.calls.length, 1);
    release();
    await tick();
    assert.deepEqual(t.synced, ['oid-1']);
  });

  it('usuarios distintos no se bloquean entre sí', async () => {
    const t = setup();
    t.ensure(user);
    t.ensure({ ...user, userId: 'oid-2' });
    await tick();
    assert.equal(t.calls.length, 2);
  });

  it('si ms-user falla no revienta, no marca como sincronizado y reintenta recién tras la pausa', async () => {
    let fail = true;
    const t = setup(() => (fail ? Promise.reject(new Error('ms-user caído')) : Promise.resolve()));
    t.ensure(user);
    await tick();
    assert.deepEqual(t.synced, []);

    t.advance(100); // aún dentro de la pausa: no martillar
    t.ensure(user);
    await tick();
    assert.equal(t.calls.length, 1);

    fail = false;
    t.advance(500);
    t.ensure(user);
    await tick();
    assert.equal(t.calls.length, 2);
    assert.deepEqual(t.synced, ['oid-1']);
  });

  it('sin correo (o sin id) en el token no se intenta: ms-user lo exige para crear', async () => {
    const t = setup();
    t.ensure({ ...user, email: '' });
    t.ensure({ ...user, userId: undefined });
    await tick();
    assert.equal(t.calls.length, 0);
  });
});
