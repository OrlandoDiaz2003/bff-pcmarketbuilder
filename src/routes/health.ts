import { NextFunction, Request, Response, Router } from 'express';

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ status: 'ok' });
  }),
);

export default router;