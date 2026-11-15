import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EventEnvelope, TOPIC_BUSINESS, buildEnvelope, kafkaEnabled, publish, setEventSink } from './kafka.js';

const envelope = (): EventEnvelope => buildEnvelope('ORDER_PAID', 'buyer-1', { orderId: 'o1' });

describe('sobre de los eventos', () => {
  it('trae eventId único, versión 1, fecha ISO, origen bff y el actor', () => {
    const a = buildEnvelope('LISTING_VIEWED', 'u1', { publicationId: 'p1' }, new Date('2026-11-12T10:00:00Z'));
    const b = buildEnvelope('LISTING_VIEWED', 'u1', {});
    assert.notEqual(a.eventId, b.eventId);
    assert.equal(a.version, 1);
    assert.equal(a.occurredAt, '2026-11-12T10:00:00.000Z');
    assert.equal(a.source, 'bff');
    assert.equal(a.actorId, 'u1');
    assert.equal(a.eventType, 'LISTING_VIEWED');
  });

  it('sin usuario el actor es null (visitante anónimo)', () => {
    assert.equal(buildEnvelope('SEARCH_PERFORMED', undefined, {}).actorId, null);
    assert.equal(buildEnvelope('SEARCH_PERFORMED', '', {}).actorId, null);
  });
});

describe('publicar en Kafka ("dispara y sigue")', () => {
  afterEach(() => setEventSink(null));

  it('sin KAFKA_BROKERS no hace nada y no falla', () => {
    setEventSink(null);
    assert.equal(kafkaEnabled(), false);
    assert.doesNotThrow(() => publish(TOPIC_BUSINESS, 'k', envelope()));
  });

  it('envía el sobre como JSON con la clave indicada', async () => {
    const sent: Array<{ topic: string; key: string; value: string }> = [];
    setEventSink({ send: async (topic, key, value) => void sent.push({ topic, key, value }) });
    const e = envelope();
    publish(TOPIC_BUSINESS, 'o1', e);
    await new Promise((r) => setImmediate(r));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].topic, 'pcb.business.events');
    assert.equal(sent[0].key, 'o1');
    assert.deepEqual(JSON.parse(sent[0].value), e);
  });

  it('si Kafka falla (rechazo asíncrono o excepción) no lanza ni deja una promesa sin atrapar', async () => {
    setEventSink({ send: () => Promise.reject(new Error('broker caído')) });
    assert.doesNotThrow(() => publish(TOPIC_BUSINESS, 'k', envelope()));
    setEventSink({ send: () => { throw new Error('falla síncrona'); } });
    assert.doesNotThrow(() => publish(TOPIC_BUSINESS, 'k', envelope()));
    await new Promise((r) => setImmediate(r));
  });
});
