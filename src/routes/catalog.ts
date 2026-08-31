import { NextFunction, Request, Response, Router } from 'express';
import { BadRequestError } from '../errors.js';
import { CreateListingRequest, createPublication } from '../lib/publications.js';
import { getListingDetail, ListingSearchParams, searchListings } from '../services/catalogService.js';
import { Grade, PublicationStatus } from '../types.js';

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

const PUBLICATION_STATUSES = new Set<PublicationStatus>([
  'ACTIVE',
  'RESERVED',
  'SOLD',
  'IN_INSPECTION',
  'WITHDRAWN',
]);

const GRADES = new Set<Grade>(['GRADE_A', 'GRADE_B', 'GRADE_C']);

function parseIntParam(raw: unknown, name: string, fallback: number, min: number, max: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestError(`Parámetro '${name}' inválido: se esperaba un entero entre ${min} y ${max}`);
  }
  return value;
}

function parseSearchParams(query: Request['query']): ListingSearchParams {
  const statusRaw = query.status as string | undefined;
  const status = statusRaw ?? 'ACTIVE';
  if (!PUBLICATION_STATUSES.has(status as PublicationStatus)) {
    throw new BadRequestError(
      `Parámetro 'status' inválido: ${statusRaw}. Valores: ${[...PUBLICATION_STATUSES].join(', ')}`,
    );
  }

  const gradeRaw = query.grade as string | undefined;
  if (gradeRaw !== undefined && !GRADES.has(gradeRaw as Grade)) {
    throw new BadRequestError(
      `Parámetro 'grade' inválido: ${gradeRaw}. Valores: ${[...GRADES].join(', ')}`,
    );
  }

  const maxPriceRaw = query.maxPrice as string | undefined;
  let maxPrice: number | undefined;
  if (maxPriceRaw !== undefined) {
    maxPrice = Number(maxPriceRaw);
    if (!Number.isInteger(maxPrice) || maxPrice < 0) {
      throw new BadRequestError(`Parámetro 'maxPrice' inválido: se esperaba un entero >= 0`);
    }
  }

  return {
    q: (query.q as string) || undefined,
    brand: (query.brand as string) || undefined,
    subcategoryId: (query.subcategoryId as string) || undefined,
    socket: (query.socket as string) || undefined,
    sellerId: (query.sellerId as string) || undefined,
    status: status as PublicationStatus,
    grade: gradeRaw as Grade | undefined,
    maxPrice,
    page: parseIntParam(query.page, 'page', 1, 1, 1_000_000),
    limit: parseIntParam(query.limit, 'limit', 20, 1, 100),
  };
}

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = parseSearchParams(req.query);
    res.json(await searchListings(params));
  }),
);

router.get(
  '/:publicationId',
  asyncHandler(async (req, res) => {
    const raw = req.params.publicationId;
    const publicationId = Array.isArray(raw) ? raw[0] : raw;
    if (!publicationId) throw new BadRequestError('Falta publicationId en la ruta');
    const detail = await getListingDetail(publicationId);
    res.json(detail);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const created = await createPublication(req.body as CreateListingRequest, {
      userId: req.header('X-User-Id'),
      role: req.header('X-User-Role'),
    });
    res.status(201).json(created);
  }),
);

export default router;