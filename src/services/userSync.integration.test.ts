import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

/**
 * Prueba de integración: el servicio real (con lib/users.ts) contra un ms-user simulado. Comprueba que la llamada
 * es POST /sync con la identidad del token en los headers que ms-user espera (X-User-Id/Role/Email/Name).
 */
describe('userSync contra un ms-user simulado', () => {
  const requests: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders }> = [];
  let server: http.Server;

  before(async () => {
    server = http.createServer((req, res) => {
      requests.push({ method: req.method, url: req.url, headers: req.headers });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ userId: 'u1', username: 'ana' }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as { port: number };
    process.env.USERS_BASE_URL = `http://localhost:${port}/api/v1/users`; // antes de cargar config.ts
  });

  after(() => server.close());

  it('envía POST /sync con la identidad y no repite dentro de la ventana', async () => {
    const { ensureUserSynced } = await import('./userSync.js');
    const auth = { userId: 'oid-77', role: 'WORKSHOP_ADMIN', email: 'ana@correo.cl', name: 'Ana Pérez' };

    ensureUserSynced(auth);
    await new Promise((resolve) => setTimeout(resolve, 150));
    ensureUserSynced(auth);
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.equal(requests.length, 1, 'una sola llamada');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].url, '/api/v1/users/sync');
    assert.equal(requests[0].headers['x-user-id'], 'oid-77');
    assert.equal(requests[0].headers['x-user-role'], 'WORKSHOP_ADMIN');
    assert.equal(requests[0].headers['x-user-email'], 'ana@correo.cl');
    assert.equal(requests[0].headers['x-user-name'], 'Ana Pérez');
  });
});
