import { config } from '../config.js';
import { Publication, PublicationStatus, Grade, SpringPage } from '../types.js';
import { buildQuery, requestJson } from './http.js';

export interface CreateListingRequest {
  productId: string;
  title: string;
  description?: string;
  price: number;
  grade: Grade;
  usageTimeMonths?: number;
}

export interface AuthHeaders {
  userId?: string;
  role?: string;
}

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

export async function createPublication(
  body: CreateListingRequest,
  authHeaders: AuthHeaders,
): Promise<Publication> {
  const headers: Record<string, string> = {};
  if (authHeaders.userId) headers['X-User-Id'] = authHeaders.userId;
  if (authHeaders.role) headers['X-User-Role'] = authHeaders.role;
  return requestJson<Publication>(config.publicationsBaseUrl, {
    method: 'POST',
    headers,
    body,
  });
}

export interface AddImageRequest {
  imageUrl: string;
  isPrimary?: boolean;
}

export async function addPublicationImage(
  id: string,
  body: AddImageRequest,
  authHeaders: AuthHeaders,
): Promise<Publication> {
  const headers: Record<string, string> = {};
  if (authHeaders.userId) headers['X-User-Id'] = authHeaders.userId;
  if (authHeaders.role) headers['X-User-Role'] = authHeaders.role;
  return requestJson<Publication>(`${config.publicationsBaseUrl}/${id}/images`, {
    method: 'POST',
    headers,
    body,
  });
}

export interface UpdateStatusRequest {
  status: PublicationStatus;
}

export async function updatePublicationStatus(
  id: string,
  body: UpdateStatusRequest,
  authHeaders: AuthHeaders,
): Promise<Publication> {
  const headers: Record<string, string> = {};
  if (authHeaders.userId) headers['X-User-Id'] = authHeaders.userId;
  if (authHeaders.role) headers['X-User-Role'] = authHeaders.role;
  return requestJson<Publication>(`${config.publicationsBaseUrl}/${id}/status`, {
    method: 'PATCH',
    headers,
    body,
  });
}

export async function deletePublication(id: string, authHeaders: AuthHeaders): Promise<void> {
  const headers: Record<string, string> = {};
  if (authHeaders.userId) headers['X-User-Id'] = authHeaders.userId;
  if (authHeaders.role) headers['X-User-Role'] = authHeaders.role;
  return requestJson<void>(`${config.publicationsBaseUrl}/${id}`, {
    method: 'DELETE',
    headers,
  });
}