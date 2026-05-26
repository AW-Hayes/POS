export type OrderStatus = 'open' | 'completed' | 'voided' | 'refunded' | 'held' | 'estimate' | 'layaway';
export type PaymentMethod = 'cash' | 'card' | 'store_credit' | 'gift_card' | 'house_account' | 'other';

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  taxExempt: boolean;
  taxExemptCertificate?: string;
  priceLevelId?: string;
  loyaltyPoints: number;
  arBalance: number;
  creditLimit?: number;
  emailReceiptsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  userId?: string;
  orderId?: string;
  type: 'earn' | 'redeem' | 'adjust' | 'expire';
  points: number;
  note?: string;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  tenantId: string;
  type: 'work' | 'break';
  clockIn: string;
  clockOut?: string;
  note?: string;
  createdAt: string;
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
  giftCardId?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  locationId: string;
  sessionId?: string;
  userId: string;
  customerId?: string;
  customer?: Customer;
  status: OrderStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  promotionDiscount: number;
  total: number;
  notes?: string;
  /** Display name for held transactions, e.g. "Table 4" or "John Doe". */
  heldName?: string;
  /** Expiration date for estimates/quotes. */
  estimateExpiresAt?: string;
  salespersonId?: string;
  items: OrderItem[];
  payments: Payment[];
  layawayDeposits?: LayawayDeposit[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface LayawayDeposit {
  id: string;
  orderId: string;
  userId?: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  createdAt: string;
}

export interface CashDrop {
  id: string;
  sessionId: string;
  userId: string;
  amount: number;
  note?: string;
  createdAt: string;
}

export interface CreateEstimateRequest {
  locationId: string;
  customerId?: string;
  items: AddToCartRequest[];
  notes?: string;
  estimateExpiresAt?: string;
}

export interface ConvertEstimateRequest {
  orderId: string;
  payments: Array<{ method: PaymentMethod; amount: number; reference?: string }>;
}

export interface HoldOrderRequest {
  orderId: string;
  heldName: string;
}

export interface LayawayDepositRequest {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
}

export interface CashDropRequest {
  sessionId: string;
  amount: number;
  note?: string;
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
