import { NextFunction, Request, Response, Router } from 'express';
import { config } from '../config.js';
import { Product, SpringPage } from '../types.js';
import { buildQuery, requestJson } from '../lib/http.js';

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { subcategoryId, brand, socket, q, page, limit } = req.query;
    const params: Record<string, string | undefined> = {
      // El microservicio de productos espera subcategory_id (snake_case).
      subcategory_id: typeof subcategoryId === 'string' ? subcategoryId : undefined,
      brand: typeof brand === 'string' ? brand : undefined,
      socket: typeof socket === 'string' ? socket : undefined,
      q: typeof q === 'string' ? q : undefined,
      page: typeof page === 'string' ? page : undefined,
      limit: typeof limit === 'string' ? limit : undefined,
    };
    const url = `${config.productsBaseUrl}${buildQuery(params)}`;
    res.json(await requestJson<SpringPage<Product>>(url));
  }),
);

router.get(
  '/:productId',
  asyncHandler(async (req, res) => {
    const url = `${config.productsBaseUrl}/${req.params.productId}`;
    res.json(await requestJson<Product>(url));
  }),
);

export default router;