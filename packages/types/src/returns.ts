export type RefundMethod = 'cash' | 'card' | 'store_credit' | 'gift_card';

export interface OrderReturnItem {
  id: string;
  returnId: string;
  orderItemId: string;
  quantity: number;
  price: number;
  taxRate: number;
  total: number;
}

export interface ReturnRefund {
  id: string;
  returnId: string;
  method: RefundMethod;
  amount: number;
  reference?: string;
  createdAt: string;
}

export interface OrderReturn {
  id: string;
  orderId: string;
  userId?: string;
  reason?: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  items: OrderReturnItem[];
  refunds: ReturnRefund[];
  createdAt: string;
}

export interface CreateReturnRequest {
  orderId: string;
  reason?: string;
  items: Array<{
    orderItemId: string;
    quantity: number;
  }>;
  refunds: Array<{
    method: RefundMethod;
    amount: number;
    reference?: string;
  }>;
}
