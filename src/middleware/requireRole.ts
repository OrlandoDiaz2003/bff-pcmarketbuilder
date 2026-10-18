import { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../errors.js';

/**
 * Exige un rol concreto (X-User-Role, que el authMiddleware saca del token validado).
 * Va después de requireAuth. Es una barrera adicional: el microservicio destino también lo valida.
 */
export const requireRole =
  (role: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (req.header('x-user-role') !== role) {
      next(new ForbiddenError(`Se requiere el rol ${role} para esta operación`));
      return;
    }
    next();
  };
