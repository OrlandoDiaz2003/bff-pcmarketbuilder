import { NextFunction, Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    status: 404,
    message: `No se encontró la ruta ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
}