import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/verifyToken.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

const DEFAULT_ROLE = 'BUYER_SELLER';
const KNOWN_ROLES = ['BUYER_SELLER', 'TECHNICAL_AGENT', 'WORKSHOP_ADMIN'];
const IDENTITY_HEADERS = ['x-user-id', 'x-user-role', 'x-user-email', 'x-user-name'];

function roleFromToken(roles: string[] | undefined): string {
  const known = roles?.find((role) => KNOWN_ROLES.includes(role));
  return known ?? DEFAULT_ROLE;
}

function setHeader(req: Request, name: string, value: string): void {
  if (value) req.headers[name] = value;
}

/**
 * La identidad que llega a los microservicios sale SOLO del JWT validado:
 * los X-User-* que manda el cliente se descartan siempre, así nadie puede
 * hacerse pasar por otro usuario (o por WORKSHOP_ADMIN) con un curl.
 *
 * - Bearer válido   → X-User-* reconstruidos desde los claims del token.
 * - Bearer inválido → 401.
 * - Sin Bearer      → request anónima (catálogo público); los endpoints que
 *   exigen identidad responden 401 en el microservicio.
 *
 * ALLOW_UNVERIFIED_IDENTITY=true conserva los X-User-* del cliente cuando no
 * hay Bearer. Solo para desarrollo local (script/test-bff.sh, vistas-test).
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    if (!config.allowUnverifiedIdentity) {
      for (const name of IDENTITY_HEADERS) delete req.headers[name];
    }
    next();
    return;
  }

  for (const name of IDENTITY_HEADERS) delete req.headers[name];

  try {
    const decoded = await verifyAccessToken(authHeader.slice(7));
    setHeader(req, 'x-user-id', decoded.oid);
    setHeader(req, 'x-user-role', roleFromToken(decoded.roles));
    setHeader(req, 'x-user-email', decoded.preferred_username ?? decoded.upn ?? decoded.email ?? '');
    setHeader(req, 'x-user-name', decoded.name ?? '');
    next();
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'token inválido';
    next(new HttpError(`Token de acceso inválido: ${reason}`, 401));
  }
}
