import { Request, Router } from 'express';
import { BadRequestError } from '../errors.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { CompleteInspectionRequest, completeInspection } from '../lib/inspections.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getInspectionWithListing, listOpenInspections, withListing } from '../services/inspectionService.js';

const auth = (req: Request) => ({ userId: req.header('x-user-id'), role: req.header('x-user-role') });

function idParam(req: Request): string {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) throw new BadRequestError('Falta el id de la inspección en la ruta');
  return id;
}

const router = Router();
// Toda la bandeja es solo para el admin del taller.
router.use(requireAuth, requireRole('WORKSHOP_ADMIN'));

/** Bandeja del admin: inspecciones pendientes (las más antiguas primero) con la pieza (foto, producto, vendedor). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listOpenInspections(auth(req)));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getInspectionWithListing(auth(req), idParam(req)));
  }),
);

/** Formulario del admin: genera el informe. reports valida los campos (400) y que siga abierta (409). */
router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const done = await completeInspection(auth(req), idParam(req), req.body as CompleteInspectionRequest);
    res.json(await withListing(done));
  }),
);

export default router;
