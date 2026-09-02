import { NextFunction, Request, Response, Router } from 'express';
import { getMe, syncUser, updateMe, UpdateUserRequest, UserAuthHeaders } from '../lib/users.js';

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

const readUserHeaders = (req: Request): UserAuthHeaders => ({
  userId: req.header('X-User-Id'),
  role: req.header('X-User-Role'),
  email: req.header('X-User-Email'),
  name: req.header('X-User-Name'),
});

const router = Router();

router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const user = await syncUser(readUserHeaders(req));
    res.status(200).json(user);
  }),
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await getMe({
      userId: req.header('X-User-Id'),
      role: req.header('X-User-Role'),
    });
    res.json(user);
  }),
);

router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await updateMe(
      {
        userId: req.header('X-User-Id'),
        role: req.header('X-User-Role'),
      },
      req.body as UpdateUserRequest,
    );
    res.json(user);
  }),
);

export default router;