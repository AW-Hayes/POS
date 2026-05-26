export type AdjustmentType =
  | 'sale'
  | 'return'
  | 'purchase'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'damage'
  | 'shrinkage';

export interface InventoryItem {
  id: string;
  locationId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  lowStockAt?: number;
  reorderPoint?: number;
  reorderQty?: number;
  updatedAt: string;
}

export interface InventoryAdjustment {
  id: string;
  inventoryItemId: string;
  userId?: string;
  type: AdjustmentType;
  delta: number;
  note?: string;
  reference?: string;
  createdAt: string;
}

export interface InventoryWithProduct extends InventoryItem {
  product: {
    id: string;
    name: string;
    sku?: string;
    barcode?: string;
    imageUrl?: string;
  };
  variant?: {
    id: string;
    sku?: string;
    attributeValues: Array<{ value: string; productAttribute: { attribute: { name: string } } }>;
  };
}

export interface AdjustInventoryRequest {
  locationId: string;
  productId: string;
  variantId?: string;
  type: AdjustmentType;
  delta: number;
  note?: string;
}

export interface TransferRequest {
  fromLocationId: string;
  toLocationId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>;
  note?: string;
}
