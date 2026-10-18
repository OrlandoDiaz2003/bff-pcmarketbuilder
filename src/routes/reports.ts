import { NextFunction, Request, Response, Router } from 'express';
import { config } from '../config.js';
import { callUpstream, fetchBinary } from '../lib/upstream.js';
import { requireAuth } from '../middleware/requireAuth.js';

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

const enc = (value: unknown) => encodeURIComponent(String(value));

/**
 * Proxy hacia reports-service. Ese servicio ya valida roles (agente = WORKSHOP_ADMIN)
 * y participantes del pedido a partir de X-User-*; aqui solo se reenvia la identidad.
 */
const router = Router();
router.use(requireAuth);

// Bandeja del agente tecnico: ?scope=open (default) | mine
router.get(
  '/inspections',
  asyncHandler(async (req, res) => {
    const scope = req.query.scope === 'mine' ? 'mine' : 'open';
    res.json(await callUpstream(req, `${config.reportsBaseUrl}/inspections?scope=${scope}`, 'GET'));
  }),
);

router.get(
  '/inspections/:id',
  asyncHandler(async (req, res) => {
    res.json(await callUpstream(req, `${config.reportsBaseUrl}/inspections/${enc(req.params.id)}`, 'GET'));
  }),
);

router.post(
  '/inspections/:id/claim',
  asyncHandler(async (req, res) => {
    res.json(await callUpstream(req, `${config.reportsBaseUrl}/inspections/${enc(req.params.id)}/claim`, 'POST'));
  }),
);

router.post(
  '/inspections/:id/complete',
  asyncHandler(async (req, res) => {
    res.json(
      await callUpstream(req, `${config.reportsBaseUrl}/inspections/${enc(req.params.id)}/complete`, 'POST', req.body),
    );
  }),
);

// Informe tecnico en PDF del item de la orden (comprador, vendedor o agente).
router.get(
  '/:orderItemId',
  asyncHandler(async (req, res) => {
    const file = await fetchBinary(req, `${config.reportsBaseUrl}/reports/${enc(req.params.orderItemId)}`);
    res.setHeader('Content-Type', file.contentType);
    if (file.disposition) res.setHeader('Content-Disposition', file.disposition);
    res.send(file.buffer);
  }),
);

export default router;
