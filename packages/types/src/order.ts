export type OrderStatus = 'open' | 'completed' | 'voided' | 'refunded';
export type PaymentMethod = 'cash' | 'card' | 'store_credit' | 'other';

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId?: string;
  variantId?: string;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  discount: number;
  taxRate: number;
  total: number;
}

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  locationId: string;
  sessionId?: string;
  userId: string;
  customerId?: string;
  customer?: Customer;
  status: OrderStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
  items: OrderItem[];
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AddToCartRequest {
  productId: string;
  variantId?: string;
  quantity: number;
  price?: number;
  discount?: number;
}

export interface CreateOrderRequest {
  locationId: string;
  sessionId?: string;
  customerId?: string;
  items: AddToCartRequest[];
  notes?: string;
}

export interface CompleteOrderRequest {
  orderId: string;
  payments: Array<{
    method: PaymentMethod;
    amount: number;
    reference?: string;
  }>;
}
