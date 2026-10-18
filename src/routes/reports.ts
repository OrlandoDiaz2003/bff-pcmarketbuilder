import { Request, Response, Router } from 'express';
import { BadRequestError } from '../errors.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { downloadReport } from '../lib/reports.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

/** PDF del informe técnico de una pieza (orderItemId). reports valida que sea el comprador, el vendedor o un admin. */
router.get(
  '/:orderItemId',
  asyncHandler(async (req: Request, res: Response) => {
    const raw = req.params.orderItemId;
    const orderItemId = Array.isArray(raw) ? raw[0] : raw;
    if (!orderItemId) throw new BadRequestError('Falta orderItemId en la ruta');
    const pdf = await downloadReport(
      { userId: req.header('x-user-id'), role: req.header('x-user-role') },
      orderItemId,
    );
    res.setHeader('Content-Type', pdf.contentType);
    if (pdf.contentDisposition) res.setHeader('Content-Disposition', pdf.contentDisposition);
    res.send(pdf.body);
  }),
);

export default router;
