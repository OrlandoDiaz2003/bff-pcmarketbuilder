import { NextFunction, Request, Response } from 'express';

/**
 * Middleware que exige identidad autenticada (X-User-Id).
 * El X-User-Id solo puede provenir de un Bearer token validado
 * por authMiddleware (o headers permitidos en modo dev).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.header('x-user-id')) {
    next();
    return;
  }

  res.status(401).json({
    status: 401,
    message: 'Se requiere autenticación para realizar esta operación',
    timestamp: new Date().toISOString(),
  });
}
