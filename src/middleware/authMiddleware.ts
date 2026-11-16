import { NextFunction, Request, Response } from 'express';
import { verifyIdentity } from '../auth/verifyToken.js';
import { config } from '../config.js';
import { logError } from '../lib/logger.js';
import { ensureUserSynced } from '../services/userSync.js';

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
      const identity = await verifyIdentity(token);
      // Cognito = compradores/vendedores (siempre BUYER_SELLER); el rol de Entra solo vale para tokens de Entra.
      const role = identity.provider === 'cognito' ? DEFAULT_ROLE : roleFromToken(identity.roles);
      setHeader(req, 'x-user-id', identity.userId);
      setHeader(req, 'x-user-role', role);
      setHeader(req, 'x-user-email', identity.email);
      setHeader(req, 'x-user-name', identity.name);
      // Garantiza que el usuario exista en ms-user (alta automática en su primera petición). No bloquea ni rompe la request.
      ensureUserSynced({
        userId: identity.userId,
        role,
        email: identity.email,
        name: identity.name,
      });
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