import { NextFunction, Request, Response, Router } from 'express';
import { searchProducts } from '../lib/products.js';

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
    const result = await searchProducts({
      subcategoryId: subcategoryId as string | undefined,
      brand: brand as string | undefined,
      socket: socket as string | undefined,
      q: q as string | undefined,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
    res.json(result);
  }),
);

export default router;
