export type PromotionType = 'percent_off' | 'fixed_off' | 'bogo' | 'price_override';

export interface Promotion {
  id: string;
  tenantId: string;
  name: string;
  type: PromotionType;
  value: number;
  minQty?: number;
  minAmount?: number;
  productIds: string[];
  categoryIds: string[];
  startsAt?: string;
  endsAt?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceLevel {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  discount: number;
  prices?: ProductPrice[];
}

export interface ProductPrice {
  id: string;
  priceLevelId: string;
  productId: string;
  variantId?: string;
  price: number;
}

export interface CreatePromotionRequest {
  name: string;
  type: PromotionType;
  value: number;
  minQty?: number;
  minAmount?: number;
  productIds?: string[];
  categoryIds?: string[];
  startsAt?: string;
  endsAt?: string;
}

export interface CreatePriceLevelRequest {
  name: string;
  description?: string;
  discount?: number;
}

export interface SetProductPriceRequest {
  productId: string;
  variantId?: string;
  price: number;
}
