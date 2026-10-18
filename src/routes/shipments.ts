import { NextFunction, Request, Response, Router } from 'express';
import { forwardToShipments } from '../lib/shipments.js';

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

/**
 * Proxy hacia ms-shipments. La identidad (X-User-*) ya la dejó authMiddleware
 * a partir del JWT; aquí solo se reenvía. Las rutas geo, quote y track son públicas.
 */
const proxy = (path: (req: Request) => string, status = 200) =>
  asyncHandler(async (req, res) => {
    const result = await forwardToShipments(req, path(req));
    if (result === undefined) {
      res.status(204).end();
    } else {
      res.status(status).json(result);
    }
  });

const router = Router();

// Regiones y comunas de Chile
router.get('/geo/regions', proxy(() => '/geo/regions'));
router.get('/geo/regions/:regionId/comunas', proxy((req) => `/geo/regions/${encodeURIComponent(String(req.params.regionId))}/comunas`));
router.get('/geo/comunas', proxy((req) => `/geo/comunas${queryString(req)}`));

// Libreta de direcciones del usuario
router.get('/addresses', proxy(() => '/addresses'));
router.post('/addresses', proxy(() => '/addresses', 201));
router.get('/addresses/:id', proxy((req) => `/addresses/${encodeURIComponent(String(req.params.id))}`));
router.put('/addresses/:id', proxy((req) => `/addresses/${encodeURIComponent(String(req.params.id))}`));
router.patch('/addresses/:id/default', proxy((req) => `/addresses/${encodeURIComponent(String(req.params.id))}/default`));
router.delete('/addresses/:id', proxy((req) => `/addresses/${encodeURIComponent(String(req.params.id))}`));

// Envios
router.post('/shipments/quote', proxy(() => '/shipments/quote'));
router.get('/shipments/track/:code', proxy((req) => `/shipments/track/${encodeURIComponent(String(req.params.code))}`));
router.post('/shipments', proxy(() => '/shipments', 201));
router.get('/shipments', proxy((req) => `/shipments${queryString(req)}`));
router.get('/shipments/:id', proxy((req) => `/shipments/${encodeURIComponent(String(req.params.id))}`));
router.patch('/shipments/:id/status', proxy((req) => `/shipments/${encodeURIComponent(String(req.params.id))}/status`));
router.post('/shipments/:id/cancel', proxy((req) => `/shipments/${encodeURIComponent(String(req.params.id))}/cancel`));

function queryString(req: Request): string {
  const index = req.originalUrl.indexOf('?');
  return index === -1 ? '' : req.originalUrl.slice(index);
}

export default router;
