import { Seller } from '../types.js';
import { lookupSeller } from './catalogService.js';

export interface MetricRow {
  key: string;
  label: string | null;
  count: number;
  amount: number;
}

export interface AuditRow {
  eventId: string;
  eventType: string;
  source: string | null;
  actorId: string | null;
  occurredAt: string;
  payload: string | null;
}

export type SellerLookup = (id: string) => Promise<Seller | null>;

/** Ventas por vendedor: analytics solo conoce el id; aquí se cambia por su nombre de usuario (si aún no existe, se deja el id). */
export async function withSellerNames(rows: MetricRow[], lookup: SellerLookup = lookupSeller): Promise<MetricRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      const seller = await lookup(row.key).catch(() => null);
      return { ...row, label: seller?.username ?? row.label ?? row.key };
    }),
  );
}

/** Auditoría: suma el nombre de usuario de quien hizo la acción (actorName; null si no se conoce). */
export async function withActorNames(
  rows: AuditRow[],
  lookup: SellerLookup = lookupSeller,
): Promise<Array<AuditRow & { actorName: string | null }>> {
  const names = new Map<string, string | null>();
  await Promise.all(
    [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))].map(async (id) => {
      names.set(id, (await lookup(id).catch(() => null))?.username ?? null);
    }),
  );
  return rows.map((row) => ({ ...row, actorName: row.actorId ? (names.get(row.actorId) ?? null) : null }));
}
