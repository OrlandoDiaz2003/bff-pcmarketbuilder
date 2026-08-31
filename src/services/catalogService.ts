import { config } from '../config.js';
import { getCategories, getProduct, listAllProducts } from '../lib/products.js';
import { getPublication, listAllPublications, PublicationFilters } from '../lib/publications.js';
import { getPublicProfileByOid } from '../lib/users.js';
import {
  Category,
  Grade,
  ListingCard,
  ListingDetail,
  Product,
  ProductSummary,
  Publication,
  PublicationStatus,
  Seller,
  SpringPage,
} from '../types.js';

interface CachedCatalog {
  at: number;
  index: Map<string, Product>;
}

interface CachedCategories {
  at: number;
  data: Category[];
}

interface CachedSeller {
  at: number;
  seller: Seller;
}

const ttl = () => config.cacheTtlMs;
const userTtl = () => config.userCacheTtlMs;

let catalogCache: CachedCatalog | null = null;
let categoriesCache: CachedCategories | null = null;
let missingProductsCache: { at: number; ids: Set<string> } | null = null;
const sellersCache = new Map<string, CachedSeller>();
let missingSellersCache: { at: number; ids: Set<string> } | null = null;

async function getCatalogIndex(): Promise<Map<string, Product>> {
  if (catalogCache && Date.now() - catalogCache.at < ttl()) {
    return catalogCache.index;
  }
  const products = await listAllProducts();
  const index = new Map<string, Product>();
  for (const product of products) {
    index.set(product.productId, product);
  }
  catalogCache = { at: Date.now(), index };
  return index;
}

async function lookupProduct(productId: string): Promise<Product | null> {
  const index = await getCatalogIndex();
  const cached = index.get(productId);
  if (cached) return cached;

  if (missingProductsCache && missingProductsCache.ids.has(productId)) {
    return null;
  }
  try {
    const product = await getProduct(productId);
    index.set(productId, product);
    return product;
  } catch {
    if (!missingProductsCache || Date.now() - missingProductsCache.at >= ttl()) {
      missingProductsCache = { at: Date.now(), ids: new Set() };
    }
    missingProductsCache.ids.add(productId);
    return null;
  }
}

async function lookupSeller(azureOid: string): Promise<Seller | null> {
  const cached = sellersCache.get(azureOid);
  if (cached && Date.now() - cached.at < userTtl()) {
    return cached.seller;
  }

  if (missingSellersCache && missingSellersCache.ids.has(azureOid)) {
    return null;
  }

  try {
    const seller = await getPublicProfileByOid(azureOid);
    sellersCache.set(azureOid, { at: Date.now(), seller });
    return seller;
  } catch {
    if (!missingSellersCache || Date.now() - missingSellersCache.at >= userTtl()) {
      missingSellersCache = { at: Date.now(), ids: new Set() };
    }
    missingSellersCache.ids.add(azureOid);
    return null;
  }
}

export async function getCachedCategories(): Promise<Category[]> {
  if (categoriesCache && Date.now() - categoriesCache.at < ttl()) {
    return categoriesCache.data;
  }
  const data = await getCategories();
  categoriesCache = { at: Date.now(), data };
  return data;
}

function toProductSummary(product: Product): ProductSummary {
  return {
    productId: product.productId,
    subcategoryId: product.subcategory.subcategoryId,
    subcategoryName: product.subcategory.name,
    brand: product.brand,
    model: product.model,
    socket: product.socket,
  };
}

function primaryImage(publication: Publication): string | null {
  const primary = publication.images.find((image) => image.isPrimary);
  return primary?.imageUrl ?? publication.images[0]?.imageUrl ?? null;
}

export interface ListingSearchParams {
  q?: string;
  brand?: string;
  subcategoryId?: string;
  socket?: string;
  sellerId?: string;
  status: PublicationStatus;
  maxPrice?: number;
  grade?: Grade;
  page: number;
  limit: number;
}

const normalize = (value: string | null | undefined): string => value?.trim().toLowerCase() ?? '';

function matchesSearch(listing: { publication: Publication; product: Product | null }, q: string): boolean {
  const haystack = [
    listing.publication.title,
    listing.publication.description,
    listing.product?.brand,
    listing.product?.model,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function matchesBrand(product: Product | null, brand: string): boolean {
  return normalize(product?.brand) === brand;
}

function matchesSubcategory(product: Product | null, subcategoryId: string): boolean {
  return product?.subcategory.subcategoryId === subcategoryId;
}

function matchesSocket(product: Product | null, socket: string): boolean {
  return normalize(product?.socket) === socket;
}

export async function searchListings(params: ListingSearchParams): Promise<SpringPage<ListingCard>> {
  const filters: PublicationFilters = {
    sellerId: params.sellerId,
    status: params.status,
    maxPrice: params.maxPrice,
    grade: params.grade,
  };
  const [publications, catalog] = await Promise.all([
    listAllPublications(filters),
    getCatalogIndex(),
  ]);

  const matched: { publication: Publication; product: Product | null }[] = [];
  for (const publication of publications) {
    matched.push({ publication, product: catalog.get(publication.productId) ?? null });
  }

  const q = normalize(params.q);
  const brand = normalize(params.brand);
  const socket = normalize(params.socket);

  const filtered = matched.filter((entry) => {
    if (q && !matchesSearch(entry, q)) return false;
    if (brand && !matchesBrand(entry.product, brand)) return false;
    if (params.subcategoryId && !matchesSubcategory(entry.product, params.subcategoryId)) return false;
    if (socket && !matchesSocket(entry.product, socket)) return false;
    return true;
  });

  filtered.sort((a, b) => Date.parse(b.publication.createdAt) - Date.parse(a.publication.createdAt));

  const cards: ListingCard[] = [];
  for (const { publication, product } of filtered) {
    const seller = await lookupSeller(publication.sellerId);
    cards.push({
      publicationId: publication.publicationId,
      productId: publication.productId,
      sellerId: publication.sellerId,
      title: publication.title,
      price: publication.price,
      grade: publication.grade,
      status: publication.status,
      createdAt: publication.createdAt,
      primaryImage: primaryImage(publication),
      imageCount: publication.images.length,
      product: product ? toProductSummary(product) : null,
      seller,
    });
  }

  return buildPage(cards, params.page, params.limit);
}

export async function getListingDetail(publicationId: string): Promise<ListingDetail> {
  const publication = await getPublication(publicationId);

  const [product, seller] = await Promise.all([
    lookupProduct(publication.productId),
    lookupSeller(publication.sellerId),
  ]);
  return {
    publicationId: publication.publicationId,
    sellerId: publication.sellerId,
    productId: publication.productId,
    title: publication.title,
    description: publication.description,
    price: publication.price,
    grade: publication.grade,
    usageTimeMonths: publication.usageTimeMonths,
    status: publication.status,
    createdAt: publication.createdAt,
    images: publication.images,
    product,
    seller,
  };
}

export function buildPage<T>(items: T[], page: number, limit: number): SpringPage<T> {
  const totalElements = items.length;
  const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / limit);
  const offset = (page - 1) * limit;
  const content = items.slice(offset, offset + limit);
  return {
    content,
    pageable: { pageNumber: page - 1, pageSize: limit, offset, paged: true, unpaged: false },
    totalElements,
    totalPages,
    size: limit,
    number: page - 1,
    numberOfElements: content.length,
    first: page === 1,
    last: page >= totalPages,
    empty: content.length === 0,
  };
}