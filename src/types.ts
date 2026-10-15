export type PublicationStatus = 'ACTIVE' | 'RESERVED' | 'SOLD' | 'IN_INSPECTION' | 'WITHDRAWN';

export type Grade = 'GRADE_A' | 'GRADE_B' | 'GRADE_C';

export interface PublicationImage {
  imageId: string;
  imageUrl: string;
  isPrimary: boolean;
}

export interface Publication {
  publicationId: string;
  sellerId: string;
  productId: string;
  title: string;
  description: string | null;
  price: number;
  grade: Grade;
  usageTimeMonths: number | null;
  status: PublicationStatus;
  createdAt: string;
  images: PublicationImage[];
}

export interface SubcategoryRef {
  subcategoryId: string;
  name: string;
}

export interface Product {
  productId: string;
  subcategory: SubcategoryRef;
  brand: string;
  model: string;
  socket: string | null;
  formFactor: string | null;
  ramType: string | null;
  tdpWatts: number | null;
  psuWatts: number | null;
  ramSlots: number | null;
  storageType: string | null;
}

export interface Subcategory {
  subcategoryId: string;
  name: string;
}

export interface Category {
  categoryId: string;
  name: string;
  subcategories: Subcategory[];
}

export interface SpringPage<T> {
  content: T[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    offset: number;
    paged: boolean;
    unpaged: boolean;
  };
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface ProductSummary {
  productId: string;
  subcategoryId: string;
  subcategoryName: string;
  brand: string;
  model: string;
  socket: string | null;
}

export interface Seller {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
}

export type UserRole = 'BUYER_SELLER' | 'TECHNICAL_AGENT' | 'WORKSHOP_ADMIN';

export interface UserResponse {
  userId: string;
  username: string;
  email: string;
  fullName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  address: string | null;
  role: UserRole;
  createdAt: string;
}

export interface ListingCard {
  publicationId: string;
  productId: string;
  sellerId: string;
  title: string;
  price: number;
  grade: Grade;
  status: PublicationStatus;
  createdAt: string;
  primaryImage: string | null;
  imageCount: number;
  product: ProductSummary | null;
  seller: Seller | null;
}

export interface ListingDetail {
  publicationId: string;
  sellerId: string;
  productId: string;
  title: string;
  description: string | null;
  price: number;
  grade: Grade;
  usageTimeMonths: number | null;
  status: PublicationStatus;
  createdAt: string;
  images: PublicationImage[];
  product: Product | null;
  seller: Seller | null;
}

export type PaymentStatus = 'PENDING' | 'HOLD_ESCROW' | 'RELEASED_TO_SELLER' | 'REFUNDED';

export type InspectionStatus = 'PENDING' | 'IN_REVIEW' | 'PASSED' | 'FAILED';

export interface OrderItem {
  orderItemId: string;
  publicationId: string;
  sellerId: string;
  description: string | null;
  price: number;
  inspectionStatus: string;
}

export interface Order {
  orderId: string;
  buyerId: string;
  buyerEmail: string | null;
  orderType: string;
  status: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  createdAt: string;
  items: OrderItem[];
}

/** Estado de la revisión técnica de una pieza, tal como la ve el comprador en "Mis compras". */
export interface OrderItemInspection {
  status: InspectionStatus;
  completedAt: string | null;
}

export interface OrderWithInspections extends Omit<Order, 'items'> {
  items: Array<OrderItem & { inspection: OrderItemInspection | null }>;
}

export interface ComponentCheck {
  component: string;
  result: 'OK' | 'WARNING' | 'FAIL';
  note: string | null;
}

export interface Inspection {
  id: string;
  orderId: string;
  orderItemId: string;
  publicationId: string | null;
  description: string | null;
  buyerId: string;
  buyerEmail: string | null;
  sellerId: string;
  status: InspectionStatus;
  agentId: string | null;
  maintenanceDone: string | null;
  maintenanceDate: string | null;
  workshopNotes: string | null;
  checks: ComponentCheck[];
  completedAt: string | null;
  createdAt: string;
}

/** Inspección + datos de la pieza (fotos, producto, vendedor) para que el admin la vea al revisar. */
export interface InspectionWithListing extends Inspection {
  listing: ListingDetail | null;
}
