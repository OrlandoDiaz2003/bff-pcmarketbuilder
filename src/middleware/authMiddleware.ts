import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/verifyToken.js';

const DEFAULT_ROLE = 'BUYER_SELLER';
const KNOWN_ROLES = ['BUYER_SELLER', 'TECHNICAL_AGENT', 'WORKSHOP_ADMIN'];

function roleFromToken(roles: string[] | undefined): string {
  const known = roles?.find((role) => KNOWN_ROLES.includes(role));
  return known ?? DEFAULT_ROLE;
}

function setHeader(req: Request, name: string, value: string): void {
  if (value) req.headers[name] = value;
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = await verifyAccessToken(token);
      setHeader(req, 'x-user-id', decoded.oid);
      setHeader(req, 'x-user-role', roleFromToken(decoded.roles));
      setHeader(req, 'x-user-email', decoded.preferred_username ?? '');
      setHeader(req, 'x-user-name', decoded.name ?? '');
    } catch {
      // Token inválido/expirado: no seteamos headers.
      // Los proxies existentes ya devuelven 401/403 sin ellos.
    }
  }
  // Sin Authorization header: no se toca nada (permite X-User-* a mano en dev).
  next();
}