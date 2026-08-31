import { NextFunction, Request, Response } from 'express';
import { HttpError, UpstreamError } from '../errors.js';

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const timestamp = new Date().toISOString();

  if (error instanceof UpstreamError) {
    const status = error.upstreamStatus === 404 || error.upstreamStatus === 400 ? error.upstreamStatus : 502;
    res.status(status).json({ status, message: error.message, timestamp });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ status: error.statusCode, message: error.message, timestamp });
    return;
  }

  res.status(500).json({
    status: 500,
    message: error instanceof Error ? error.message : 'Error interno del BFF',
    timestamp,
  });
}