import { Request, Router } from 'express';
import { BadRequestError } from '../errors.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  CompleteInspectionRequest,
  cancelInspection,
  completeInspection,
  dismissNotifications,
  deliverInspection,
  getInspection,
  resendNotifications,
} from '../lib/inspections.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getInspectionWithListing, listOpenInspections, withListing } from '../services/inspectionService.js';
import { events } from '../services/eventService.js';
import { lifecycle } from '../services/lifecycleService.js';

const auth = (req: Request) => ({ userId: req.header('x-user-id'), role: req.header('x-user-role') });

/** Admin que hace la acción (para la auditoría en Kafka). */
const adminId = (req: Request) => req.header('x-user-id') ?? 'unknown';

function idParam(req: Request): string {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) throw new BadRequestError('Falta el id de la inspección en la ruta');
  return id;
}

const router = Router();
// Toda la bandeja es solo para el admin del taller.
router.use(requireAuth, requireRole('WORKSHOP_ADMIN'));

/**
 * Bandeja del admin, con la pieza (foto, producto, vendedor). ?scope=open (por defecto): pendientes de revisión.
 * ?scope=to-deliver: aprobadas que el taller aún no entrega. ?scope=notifications: cerradas con correos pendientes,
 * no enviados o fallidos (con su motivo).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const scope = (req.query.scope as string | undefined) ?? 'open';
    if (scope !== 'open' && scope !== 'to-deliver' && scope !== 'notifications') {
      throw new BadRequestError("El parámetro 'scope' debe ser 'open', 'to-deliver' o 'notifications'");
    }
    res.json(await listOpenInspections(auth(req), scope));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getInspectionWithListing(auth(req), idParam(req)));
  }),
);

/**
 * Formulario del admin: genera el informe. reports valida los campos (400) y que siga abierta (409).
 * Si la pieza fue RECHAZADA se reembolsa la orden y la publicación vuelve al catálogo; lo que no se pueda aplicar
 * llega en `warnings` (y se reintenta con POST /:id/sync).
 */
router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const done = await completeInspection(auth(req), idParam(req), req.body as CompleteInspectionRequest);
    const warnings = done.status === 'FAILED' ? await lifecycle.afterRejected(done) : [];
    void events.inspectionCompleted(adminId(req), done);
    if (done.status === 'FAILED' && warnings.length === 0) void events.orderRefunded(adminId(req), done, 'REJECTED');
    res.json({ ...(await withListing(done)), warnings });
  }),
);

/**
 * El taller cancela la compra (p. ej. no se puede avisar al comprador): se reembolsa la orden y la publicación vuelve al
 * catálogo. Lo que no se pueda aplicar llega en `warnings` y se reintenta con POST /:id/sync. Idempotente.
 */
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const done = await cancelInspection(auth(req), idParam(req));
    const warnings = await lifecycle.afterCancelled(done);
    void events.orderCancelled(adminId(req), done);
    if (warnings.length === 0) void events.orderRefunded(adminId(req), done, 'CANCELLED');
    res.json({ ...(await withListing(done)), warnings });
  }),
);

/** Descarta el aviso de correos (para lo que reenviar no arregla, como un comprador sin correo): sale de la pestaña Correos. */
router.post(
  '/:id/dismiss-notifications',
  asyncHandler(async (req, res) => {
    const dismissed = await dismissNotifications(auth(req), idParam(req));
    void events.notificationsDismissed(adminId(req), dismissed);
    res.json(await withListing(dismissed));
  }),
);

/** Reenvía los correos pendientes o fallidos de una inspección cerrada (el "Reenviar correos" del admin). */
router.post(
  '/:id/resend-notifications',
  asyncHandler(async (req, res) => {
    const resent = await resendNotifications(auth(req), idParam(req));
    void events.notificationsResent(adminId(req), resent);
    res.json(await withListing(resent));
  }),
);

/** El taller entrega la pieza aprobada: la publicación pasa a SOLD. Idempotente (sirve para reintentar). */
router.post(
  '/:id/deliver',
  asyncHandler(async (req, res) => {
    const done = await deliverInspection(auth(req), idParam(req));
    const warnings = await lifecycle.afterDelivered(done);
    void events.orderDelivered(adminId(req), done);
    res.json({ ...(await withListing(done)), warnings });
  }),
);

/** Reaplica (de forma idempotente) la orden y la publicación según el estado de la inspección: el "Reintentar" del admin. */
router.post(
  '/:id/sync',
  asyncHandler(async (req, res) => {
    const inspection = await getInspection(auth(req), idParam(req));
    res.json({ id: inspection.id, status: inspection.status, warnings: await lifecycle.reconcile(inspection) });
  }),
);

export default router;
