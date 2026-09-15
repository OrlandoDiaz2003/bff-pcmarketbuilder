import { config } from '../config.js';
import { Category, Product, SpringPage } from '../types.js';
import { buildQuery, requestJson } from './http.js';

async function fetchCatalogPage(page: number, limit: number): Promise<SpringPage<Product>> {
  const url = `${config.productsBaseUrl}/search${buildQuery({ page, limit })}`;
  return requestJson<SpringPage<Product>>(url);
}

export async function listAllProducts(): Promise<Product[]> {
  const limit = config.catalogPageSize;
  const first = await fetchCatalogPage(1, limit);
  const products = [...first.content];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await fetchCatalogPage(page, limit);
    products.push(...next.content);
  }
  return products;
}

export async function getProduct(productId: string): Promise<Product> {
  return requestJson<Product>(`${config.productsBaseUrl}/${productId}`);
}

export interface ProductSearchParams {
  subcategoryId?: string;
  brand?: string;
  socket?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export async function searchProducts(params: ProductSearchParams): Promise<SpringPage<Product>> {
  const url = `${config.productsBaseUrl}/search${buildQuery({
    subcategory_id: params.subcategoryId,
    brand: params.brand,
    socket: params.socket,
    q: params.q,
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  })}`;
  return requestJson<SpringPage<Product>>(url);
}

export async function getCategories(): Promise<Category[]> {
  return requestJson<Category[]>(`${config.productsBaseUrl}/categories`);
}