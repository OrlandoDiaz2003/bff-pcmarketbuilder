import { Request, Router } from 'express';
import { config } from '../config.js';
import { NotFoundError } from '../errors.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { buildQuery, requestJson } from '../lib/http.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

/** Lo único que se reenvía a topic-admin-service: método + ruta. Cualquier otra cosa responde 404. */
const ALLOWED: Array<{ method: 'GET' | 'POST' | 'PATCH'; path: RegExp }> = [
  { method: 'GET', path: /^\/topics$/ },
  { method: 'POST', path: /^\/topics\/ensure$/ },
  { method: 'GET', path: /^\/topics\/[^/]+$/ },
  { method: 'PATCH', path: /^\/topics\/[^/]+\/retention$/ },
  { method: 'GET', path: /^\/groups$/ },
  { method: 'GET', path: /^\/groups\/[^/]+\/lag$/ },
  { method: 'POST', path: /^\/groups\/[^/]+\/reset-offsets$/ },
  { method: 'GET', path: /^\/dlt\/[^/]+$/ },
  { method: 'POST', path: /^\/dlt\/[^/]+\/replay$/ },
];

export function isAllowedKafkaAdminCall(method: string, path: string): boolean {
  return ALLOWED.some((rule) => rule.method === method && rule.path.test(path));
}

const router = Router();
router.use(requireAuth, requireRole('WORKSHOP_ADMIN'));

/**
 * Administración de Kafka para el taller (tópicos, retention, lag, offsets y dead-letter). El BFF valida el token y
 * reenvía a topic-admin-service con la identidad del admin; solo viajan las rutas de la lista y los parámetros conocidos.
 */
router.use(
  asyncHandler(async (req: Request, res) => {
    const method = req.method as 'GET' | 'POST' | 'PATCH';
    if (!isAllowedKafkaAdminCall(method, req.path)) {
      throw new NotFoundError(`Ruta de administración de Kafka no disponible: ${method} ${req.path}`);
    }
    const query = buildQuery({
      limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      partition: typeof req.query.partition === 'string' ? req.query.partition : undefined,
      offset: typeof req.query.offset === 'string' ? req.query.offset : undefined,
    });
    res.json(
      await requestJson(`${config.topicAdminBaseUrl}${req.path}${query}`, {
        method,
        headers: { 'X-User-Id': req.header('x-user-id') ?? '', 'X-User-Role': req.header('x-user-role') ?? '' },
        body: method === 'GET' ? undefined : (req.body ?? {}),
      }),
    );
  }),
);

export default router;
