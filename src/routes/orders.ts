import { Request, Router } from 'express';
import { BadRequestError } from '../errors.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { listMyOrders, placeOrder } from '../services/orderService.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 20;

const buyerId = (req: Request): string => req.header('x-user-id') as string;

function parseCheckout(body: unknown): { publicationIds: string[]; buyerEmail: string } {
  const { publicationIds, buyerEmail } = (body ?? {}) as { publicationIds?: unknown; buyerEmail?: unknown };

  if (
    !Array.isArray(publicationIds) ||
    publicationIds.length === 0 ||
    publicationIds.length > MAX_ITEMS ||
    !publicationIds.every((id) => typeof id === 'string' && id.trim() !== '')
  ) {
    throw new BadRequestError(`'publicationIds' debe ser una lista de 1 a ${MAX_ITEMS} ids de publicación`);
  }
  if (new Set(publicationIds).size !== publicationIds.length) {
    throw new BadRequestError("'publicationIds' no puede repetir publicaciones");
  }
  if (typeof buyerEmail !== 'string' || buyerEmail.length > 150 || !EMAIL.test(buyerEmail.trim())) {
    throw new BadRequestError("'buyerEmail' debe ser un correo válido");
  }
  return { publicationIds: publicationIds as string[], buyerEmail: buyerEmail.trim() };
}

const router = Router();
router.use(requireAuth);

/** Compra. Body: { publicationIds: string[], buyerEmail: string } — el comprador sale del token, el precio de la publicación. */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { publicationIds, buyerEmail } = parseCheckout(req.body);
    res.status(201).json(await placeOrder(buyerId(req), publicationIds, buyerEmail));
  }),
);

/** Mis compras, con el estado de la revisión técnica de cada pieza. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listMyOrders(buyerId(req)));
  }),
);

export default router;
