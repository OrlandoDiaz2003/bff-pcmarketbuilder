import { config } from '../config.js';
import { logError } from '../lib/logger.js';
import { syncUser, UserAuthHeaders } from '../lib/users.js';
import { forgetUserProfile } from './catalogService.js';

export interface UserSyncDeps {
  /** Llama a ms-user (POST /users/sync) con la identidad del token. */
  sync: (auth: UserAuthHeaders) => Promise<unknown>;
  now: () => number;
  /** Cuánto vale una sincronización exitosa antes de repetirla (refresca rol/correo/nombre de Entra). */
  ttlMs: number;
  /** Cuánto esperar antes de reintentar tras un fallo (no martillar a ms-user si está caído). */
  retryMs: number;
  /** Se invoca al sincronizar bien (p. ej. para olvidar la caché de "este usuario no existe"). */
  onSynced?: (oid: string) => void;
}

const PRUNE_ABOVE = 5000;

/**
 * Alta automática del usuario en ms-user: se sincroniza en la primera petición autenticada y luego cada `ttlMs`.
 * Es "dispara y sigue": nunca bloquea ni rompe la petición del usuario, y las peticiones simultáneas de un mismo
 * usuario comparten una sola llamada. Sin correo en el token no se intenta (ms-user lo exige para crear).
 */
export function createUserSync(deps: UserSyncDeps): (auth: UserAuthHeaders) => void {
  const nextAttemptAt = new Map<string, number>();
  const inFlight = new Set<string>();

  const prune = () => {
    if (nextAttemptAt.size <= PRUNE_ABOVE) return;
    const now = deps.now();
    for (const [oid, until] of nextAttemptAt) {
      if (until <= now) nextAttemptAt.delete(oid);
    }
  };

  return (auth) => {
    const oid = auth.userId;
    if (!oid || !auth.email) return;
    if (inFlight.has(oid)) return;
    if (deps.now() < (nextAttemptAt.get(oid) ?? 0)) return;

    inFlight.add(oid);
    deps
      .sync(auth)
      .then(() => {
        nextAttemptAt.set(oid, deps.now() + deps.ttlMs);
        deps.onSynced?.(oid);
      })
      .catch((error: unknown) => {
        nextAttemptAt.set(oid, deps.now() + deps.retryMs);
        logError(`[users] no se pudo sincronizar a ${oid} con ms-user: ${(error as Error).message}`);
      })
      .finally(() => {
        inFlight.delete(oid);
        prune();
      });
  };
}

export const ensureUserSynced = createUserSync({
  sync: syncUser,
  now: Date.now,
  ttlMs: config.userSyncTtlMs,
  retryMs: config.userSyncRetryMs,
  onSynced: forgetUserProfile,
});
