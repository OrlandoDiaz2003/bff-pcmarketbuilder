import { NextFunction, Request, Response, Router } from 'express';
import { config } from '../config.js';
import { BadRequestError, HttpError } from '../errors.js';
import { callUpstream, isAgent } from '../lib/upstream.js';
import { requireAuth } from '../middleware/requireAuth.js';

interface Order {
  orderId: string;
  buyerId: string;
  [key: string]: unknown;
}

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

const base = `${config.paymentsBaseUrl}/orders`;
const orderUrl = (id: unknown, suffix = '') => `${base}/${encodeURIComponent(String(id))}${suffix}`;

/**
 * El microservicio de pagos no valida identidad: el BFF es quien impone que un
 * comprador solo vea y pague sus propias ordenes, y que liberar/reembolsar
 * (movimientos del escrow) sea cosa del agente tecnico.
 */
async function loadOwnedOrder(req: Request): Promise<Order> {
  const order = await callUpstream<Order>(req, orderUrl(req.params.id), 'GET');
  if (order.buyerId !== req.header('x-user-id') && !isAgent(req)) {
    throw new HttpError('No tienes acceso a esta orden', 403);
  }
  return order;
}

function requireAgent(req: Request, _res: Response, next: NextFunction): void {
  next(isAgent(req) ? undefined : new HttpError('Solo el agente técnico puede hacer esto', 403));
}

const router = Router();
router.use(requireAuth);

router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const items = (req.body as { items?: unknown }).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('La orden debe tener al menos un item');
    }
    // buyerId y buyerEmail siempre salen del token, nunca del body.
    const body = { ...(req.body as object), buyerId: req.header('x-user-id'), buyerEmail: req.header('x-user-email') || undefined };
    res.status(201).json(await callUpstream(req, base, 'POST', body));
  }),
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const buyerId =
      isAgent(req) && typeof req.query.buyerId === 'string' ? req.query.buyerId : req.header('x-user-id');
    res.json(await callUpstream(req, `${base}?buyerId=${encodeURIComponent(String(buyerId))}`, 'GET'));
  }),
);

router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    res.json(await loadOwnedOrder(req));
  }),
);

router.post(
  '/orders/:id/pay',
  asyncHandler(async (req, res) => {
    const order = await loadOwnedOrder(req);
    if (order.buyerId !== req.header('x-user-id')) {
      throw new HttpError('Solo el comprador puede pagar su orden', 403);
    }
    res.json(await callUpstream(req, orderUrl(req.params.id, '/pay'), 'POST', req.body));
  }),
);

router.post(
  '/orders/:id/release',
  requireAgent,
  asyncHandler(async (req, res) => {
    res.json(await callUpstream(req, orderUrl(req.params.id, '/release'), 'POST'));
  }),
);

router.post(
  '/orders/:id/refund',
  requireAgent,
  asyncHandler(async (req, res) => {
    res.json(await callUpstream(req, orderUrl(req.params.id, '/refund'), 'POST'));
  }),
);

export default router;
