import { config } from '../config.js';
import { Publication, PublicationStatus, Grade, SpringPage } from '../types.js';
import { buildQuery, requestJson } from './http.js';

export interface PublicationFilters {
  sellerId?: string;
  status?: PublicationStatus;
  maxPrice?: number;
  grade?: Grade;
}

interface PublicationPageParams extends PublicationFilters {
  page: number;
  limit: number;
}

async function fetchPage(params: PublicationPageParams): Promise<SpringPage<Publication>> {
  const url = `${config.publicationsBaseUrl}${buildQuery({
    sellerId: params.sellerId,
    status: params.status,
    maxPrice: params.maxPrice,
    grade: params.grade,
    page: params.page,
    limit: params.limit,
  })}`;
  return requestJson<SpringPage<Publication>>(url);
}

export async function listAllPublications(filters: PublicationFilters): Promise<Publication[]> {
  const limit = config.catalogPageSize;
  const first = await fetchPage({ ...filters, page: 1, limit });
  const publications = [...first.content];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await fetchPage({ ...filters, page, limit });
    publications.push(...next.content);
  }
  return publications;
}

export async function getPublication(publicationId: string): Promise<Publication> {
  return requestJson<Publication>(`${config.publicationsBaseUrl}/${publicationId}`);
}