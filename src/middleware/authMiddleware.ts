import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/verifyToken.js';
import { config } from '../config.js';
import { logError } from '../lib/logger.js';

const DEFAULT_ROLE = 'BUYER_SELLER';
const KNOWN_ROLES = ['BUYER_SELLER', 'TECHNICAL_AGENT', 'WORKSHOP_ADMIN'];
const INTERNAL_HEADERS = ['x-user-id', 'x-user-role', 'x-user-email', 'x-user-name'] as const;

function roleFromToken(roles: string[] | undefined): string {
  const known = roles?.find((role) => KNOWN_ROLES.includes(role));
  return known ?? DEFAULT_ROLE;
}

function setHeader(req: Request, name: string, value: string): void {
  if (value) req.headers[name] = value;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    // Si viene Bearer token, el cliente nunca puede predefinir headers de identidad
    for (const h of INTERNAL_HEADERS) delete req.headers[h];

    const token = authHeader.slice(7);
    try {
      const decoded = await verifyAccessToken(token);
      setHeader(req, 'x-user-id', decoded.oid);
      setHeader(req, 'x-user-role', roleFromToken(decoded.roles));
      setHeader(req, 'x-user-email', decoded.preferred_username ?? '');
      setHeader(req, 'x-user-name', decoded.name ?? '');
    } catch (err) {
      logError(`[auth] Token rechazado en ${req.method} ${req.path}: ${(err as Error).message}`);
      res.status(401).json({
        status: 401,
        message: 'Access token inválido o expirado',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    return next();
  }

  // Sin Authorization header:
  // En producción (o cuando allowDevAuthHeaders es false), se eliminan los headers internos
  if (!config.allowDevAuthHeaders) {
    for (const h of INTERNAL_HEADERS) delete req.headers[h];
  }

  next();
}