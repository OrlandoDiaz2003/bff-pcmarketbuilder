import { randomUUID } from 'node:crypto';
import { Kafka, Partitioners, logLevel } from 'kafkajs';
import { config } from '../config.js';
import { log, logError } from './logger.js';

export const TOPIC_BUSINESS = 'pcb.business.events';
export const TOPIC_AUDIT = 'pcb.audit.events';
export const EVENT_SOURCE = 'bff';

/** Sobre común de todos los eventos (ver docs/07-kafka/EVENTOS.md). El payload no lleva datos personales: nunca correos. */
export interface EventEnvelope {
  eventId: string;
  eventType: string;
  version: number;
  occurredAt: string;
  source: string;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export function buildEnvelope(
  eventType: string,
  actorId: string | null | undefined,
  payload: Record<string, unknown>,
  now: Date = new Date(),
): EventEnvelope {
  return {
    eventId: randomUUID(),
    eventType,
    version: 1,
    occurredAt: now.toISOString(),
    source: EVENT_SOURCE,
    actorId: actorId || null,
    payload,
  };
}

/** Destino de los eventos (Kafka en producción; un doble en las pruebas). */
export interface EventSink {
  send(topic: string, key: string, value: string): Promise<void>;
}

const RECONNECT_BACKOFF_MS = 30_000;

/**
 * Productor KafkaJS con conexión perezosa: no se conecta hasta el primer evento y, si el clúster no responde, espera
 * 30 s antes de volver a intentarlo (los eventos de ese rato se descartan con un aviso en el log, nunca rompen la petición).
 * acks=all + idempotencia: no se pierde ni se duplica un evento por un reintento interno.
 */
export function createKafkaSink(brokers: string[], clientId: string): EventSink {
  const kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.NOTHING,
    connectionTimeout: 3_000,
    requestTimeout: 5_000,
    retry: { retries: 2, initialRetryTime: 300 },
  });
  const producer = kafka.producer({
    allowAutoTopicCreation: false, // los tópicos los crea topic-admin-service
    idempotent: true,
    maxInFlightRequests: 1,
    createPartitioner: Partitioners.DefaultPartitioner, // mismo reparto por clave que los clientes Java
  });

  let connected = false;
  let connecting: Promise<void> | null = null;
  let retryAfter = 0;
  producer.on(producer.events.DISCONNECT, () => {
    connected = false;
  });

  async function ensureConnected(): Promise<void> {
    if (connected) return;
    if (Date.now() < retryAfter) throw new Error('Kafka no disponible (se reintentará en unos segundos)');
    connecting ??= producer
      .connect()
      .then(() => {
        connected = true;
        log(`[kafka] productor conectado a ${brokers.join(',')}`);
      })
      .catch((error: unknown) => {
        retryAfter = Date.now() + RECONNECT_BACKOFF_MS;
        throw error;
      })
      .finally(() => {
        connecting = null;
      });
    await connecting;
  }

  return {
    async send(topic, key, value) {
      await ensureConnected();
      await producer.send({ topic, acks: -1, timeout: 5_000, messages: [{ key, value }] });
    },
  };
}

let sink: EventSink | null =
  config.kafkaBrokers.length > 0 ? createKafkaSink([...config.kafkaBrokers], config.kafkaClientId) : null;

/** Solo para las pruebas (y para apagar la publicación). */
export function setEventSink(next: EventSink | null): void {
  sink = next;
}

export function kafkaEnabled(): boolean {
  return sink !== null;
}

/**
 * "Dispara y sigue": no espera a Kafka ni propaga errores. Si el clúster está caído solo queda una línea en el log y la
 * compra, la revisión o la búsqueda que originó el evento siguen funcionando.
 */
export function publish(topic: string, key: string, envelope: EventEnvelope): void {
  if (!sink) return;
  let result: Promise<void>;
  try {
    result = sink.send(topic, key, JSON.stringify(envelope));
  } catch (error) {
    logError(`[kafka] no se pudo publicar ${envelope.eventType} en ${topic}: ${(error as Error).message}`);
    return;
  }
  result.catch((error: unknown) => {
    logError(`[kafka] no se pudo publicar ${envelope.eventType} en ${topic}: ${(error as Error).message}`);
  });
}
