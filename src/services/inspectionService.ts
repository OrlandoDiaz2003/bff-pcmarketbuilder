import { InspectionAuth, getInspection, listInspections } from '../lib/inspections.js';
import { Inspection, InspectionWithListing } from '../types.js';
import { getListingDetail } from './catalogService.js';

/**
 * Suma a cada inspección los datos de la pieza (fotos, producto, vendedor) para que el admin la vea al revisar.
 * Si la publicación ya no existe o falla la consulta, listing = null: la lista nunca se cae por una foto.
 */
export async function withListing(inspection: Inspection): Promise<InspectionWithListing> {
  if (!inspection.publicationId) return { ...inspection, listing: null };
  const listing = await getListingDetail(inspection.publicationId).catch(() => null);
  return { ...inspection, listing };
}

export async function listOpenInspections(auth: InspectionAuth): Promise<InspectionWithListing[]> {
  const inspections = await listInspections(auth, 'open');
  return Promise.all(inspections.map(withListing));
}

export async function getInspectionWithListing(auth: InspectionAuth, id: string): Promise<InspectionWithListing> {
  return withListing(await getInspection(auth, id));
}
