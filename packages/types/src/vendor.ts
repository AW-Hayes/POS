export interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  code?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  variantId?: string;
  product?: { id: string; name: string; sku?: string };
  variant?: { id: string; sku?: string };
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  total: number;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  locationId: string;
  vendorId?: string;
  vendor?: Vendor;
  userId?: string;
  status: PurchaseOrderStatus;
  notes?: string;
  total: number;
  orderedAt?: string;
  receivedAt?: string;
  items: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseOrderRequest {
  locationId: string;
  vendorId?: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    orderedQty: number;
    unitCost: number;
  }>;
}

export interface ReceivePurchaseOrderRequest {
  items: Array<{
    purchaseOrderItemId: string;
    receivedQty: number;
  }>;
}
