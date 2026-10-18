import { Request, Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { listMySales } from '../services/saleService.js';

const router = Router();
router.use(requireAuth);

/** "Mis ventas": las piezas que vendió el usuario autenticado y en qué etapa van. Solo ve las suyas. */
router.get(
  '/',
  asyncHandler(async (req: Request, res) => {
    res.json(await listMySales(req.header('x-user-id') as string));
  }),
);

export default router;
