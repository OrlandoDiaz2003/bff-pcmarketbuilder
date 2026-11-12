import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAllowedKafkaAdminCall } from './kafkaAdmin.js';

describe('administración de Kafka vía BFF: solo pasan las rutas conocidas', () => {
  it('permite las operaciones de topic-admin con su método', () => {
    const ok: Array<[string, string]> = [
      ['GET', '/topics'], ['POST', '/topics/ensure'], ['GET', '/topics/pcb.business.events'],
      ['PATCH', '/topics/pcb.business.events/retention'], ['GET', '/groups'], ['GET', '/groups/analytics-aggregator/lag'],
      ['POST', '/groups/analytics-aggregator/reset-offsets'], ['GET', '/dlt/pcb.business.events.dlt'],
      ['POST', '/dlt/pcb.business.events.dlt/replay'],
    ];
    for (const [method, path] of ok) assert.ok(isAllowedKafkaAdminCall(method, path), `${method} ${path}`);
  });

  it('rechaza otros métodos, otras rutas y recorridos de directorios', () => {
    const bad: Array<[string, string]> = [
      ['DELETE', '/topics/pcb.business.events'], ['POST', '/topics'], ['GET', '/actuator/env'], ['GET', '/'],
      ['GET', '/topics/a/b/c'], ['GET', '/topics/../actuator'], ['PATCH', '/topics/ensure'], ['GET', '/groups/x/reset-offsets'],
    ];
    for (const [method, path] of bad) assert.ok(!isAllowedKafkaAdminCall(method, path), `${method} ${path}`);
  });
});
