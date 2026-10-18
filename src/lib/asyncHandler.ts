import { NextFunction, Request, Response } from 'express';

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

/** Envuelve un handler async para que sus errores lleguen al errorHandler (Express 5 ya lo hace, esto lo deja explícito). */
export const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
