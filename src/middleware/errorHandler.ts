import { NextFunction, Request, Response } from 'express';
import { HttpError, UpstreamError } from '../errors.js';

/**
 * Errores que lanza body-parser (express.json) antes de llegar a las rutas.
 * Traen su propio status y `type`, pero no son HttpError, así que hay que
 * traducirlos explícitamente para no reportarlos como 500.
 */
const BODY_PARSER_MESSAGES: Record<string, { status: number; message: string }> = {
  'entity.parse.failed': {
    status: 400,
    message: 'El body de la request no es JSON válido',
  },
  'entity.too.large': {
    status: 413,
    message: 'El body de la request excede el tamaño máximo permitido (100kb)',
  },
};

function bodyParserError(error: unknown): { status: number; message: string } | null {
  if (!error || typeof error !== 'object') return null;

  const candidate = error as { type?: unknown; status?: unknown; statusCode?: unknown };
  if (typeof candidate.type === 'string') {
    const mapped = BODY_PARSER_MESSAGES[candidate.type];
    if (mapped) return mapped;
  }

  // Fallback por status, para no depender del `type` de la versión de body-parser.
  const status =
    typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.statusCode === 'number'
        ? candidate.statusCode
        : undefined;

  if (status === 400) return { status: 400, message: 'El body de la request no es JSON válido' };
  if (status === 413) {
    return { status: 413, message: 'El body de la request excede el tamaño máximo permitido (100kb)' };
  }
  return null;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const timestamp = new Date().toISOString();

  if (error instanceof UpstreamError) {
    const status = error.upstreamStatus >= 400 && error.upstreamStatus < 600 ? error.upstreamStatus : 502;
    res.status(status).json({ status, message: error.message, timestamp });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ status: error.statusCode, message: error.message, timestamp });
    return;
  }

  const bodyParser = bodyParserError(error);
  if (bodyParser) {
    res.status(bodyParser.status).json({ ...bodyParser, timestamp });
    return;
  }

  res.status(500).json({
    status: 500,
    message: error instanceof Error ? error.message : 'Error interno del BFF',
    timestamp,
  });
}