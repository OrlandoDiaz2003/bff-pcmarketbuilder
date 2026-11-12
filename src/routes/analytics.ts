import { Router } from 'express';
import { config } from '../config.js';
import { BadRequestError, NotFoundError } from '../errors.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { buildQuery, requestJson } from '../lib/http.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { AuditRow, MetricRow, withActorNames, withSellerNames } from '../services/analyticsService.js';

/** Métricas que expone analytics-service (GET /api/v1/analytics/<recurso>). */
export const ANALYTICS_RESOURCES = ['events', 'categories', 'products', 'sellers', 'inspections'] as const;

const router = Router();
// Analítica y auditoría son solo para el taller.
router.use(requireAuth, requireRole('WORKSHOP_ADMIN'));

function limitOf(raw: unknown): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new BadRequestError("El parámetro 'limit' debe ser un entero entre 1 y 200");
  }
  return limit;
}

const identity = (req: { header(name: string): string | undefined }) => ({
  'X-User-Id': req.header('x-user-id') ?? '',
  'X-User-Role': req.header('x-user-role') ?? '',
});

/** Registro de auditoría: ?limit=50 &actorId=<id>. */
router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const actorId = typeof req.query.actorId === 'string' ? req.query.actorId : undefined;
    const rows = await requestJson<AuditRow[]>(
      `${config.analyticsBaseUrl}/audit${buildQuery({ limit: limitOf(req.query.limit), actorId })}`,
      { headers: identity(req) },
    );
    res.json(await withActorNames(rows));
  }),
);

/** /api/analytics/events | categories | products | sellers | inspections (?limit=). */
router.get(
  '/:resource',
  asyncHandler(async (req, res) => {
    const raw = req.params.resource;
    const resource = Array.isArray(raw) ? raw[0] : raw;
    if (!(ANALYTICS_RESOURCES as readonly string[]).includes(resource)) {
      throw new NotFoundError(`No existe la métrica '${resource}'. Disponibles: ${ANALYTICS_RESOURCES.join(', ')}`);
    }
    const rows = await requestJson<MetricRow[]>(
      `${config.analyticsBaseUrl}/analytics/${resource}${buildQuery({ limit: limitOf(req.query.limit) })}`,
      { headers: identity(req) },
    );
    res.json(resource === 'sellers' ? await withSellerNames(rows) : rows);
  }),
);

export default router;
