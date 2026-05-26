export interface Category {
  id: string;
  tenantId: string;
  name: string;
  parentId?: string;
  sortOrder: number;
  color?: string;
  icon?: string;
  children?: Category[];
  createdAt: string;
  updatedAt: string;
}

export interface AttributeDefinition {
  id: string;
  tenantId: string;
  name: string;
  values: string[];
  createdAt: string;
}

export interface ProductAttribute {
  id: string;
  productId: string;
  attributeId: string;
  attribute: AttributeDefinition;
}

export interface VariantAttributeValue {
  id: string;
  variantId: string;
  productAttributeId: string;
  value: string;
  productAttribute: ProductAttribute;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku?: string;
  barcode?: string;
  price?: number;
  cost?: number;
  sortOrder: number;
  active: boolean;
  attributeValues: VariantAttributeValue[];
  createdAt: string;
  updatedAt: string;
}

export interface PriceBreak {
  id: string;
  productId: string;
  variantId?: string;
  minQty: number;
  price: number;
}

export interface SerialNumber {
  id: string;
  productId: string;
  variantId?: string;
  serial: string;
  status: 'available' | 'sold' | 'returned';
  orderItemId?: string;
  purchaseOrderId?: string;
  createdAt: string;
  soldAt?: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId?: string;
  category?: Category;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost?: number;
  taxable: boolean;
  trackInventory: boolean;
  active: boolean;
  imageUrl?: string;
  sortOrder: number;
  requiresAgeVerification: boolean;
  minAge?: number;
  preferredVendorId?: string;
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  priceBreaks?: PriceBreak[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductRequest {
  categoryId?: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost?: number;
  taxable?: boolean;
  trackInventory?: boolean;
  imageUrl?: string;
  attributeIds?: string[];
  requiresAgeVerification?: boolean;
  minAge?: number;
  preferredVendorId?: string;
}

export interface GenerateVariantsRequest {
  productId: string;
  attributeValues: Record<string, string[]>;
}
