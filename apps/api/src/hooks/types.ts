import type { Order, OrderItem, Payment } from '@prisma/client';

// ─── Hook event names ─────────────────────────────────────────────────────────

export type OrderHookName =
  | 'order:before-create'
  | 'order:after-create'
  | 'order:before-complete'
  | 'order:after-complete'
  | 'order:before-void'
  | 'order:after-void';

export type HookName = OrderHookName;

// ─── Payloads per event ────────────────────────────────────────────────────────

export interface OrderCreatePayload {
  tenantId: string;
  locationId: string;
  userId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    name: string;
    sku?: string;
    price: number;
    quantity: number;
    discount: number;
    taxRate: number;
    total: number;
  }>;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  customerId?: string;
  sessionId?: string;
  notes?: string;
}

export interface OrderCompletePayload {
  order: Order & { items: OrderItem[] };
  payments: Array<{ method: string; amount: number; reference?: string }>;
  userId: string;
}

export interface OrderVoidPayload {
  order: Order & { items: OrderItem[] };
  note?: string;
  userId: string;
}

export interface OrderAfterCreatePayload {
  order: Order & { items: OrderItem[]; payments: Payment[] };
}

export interface OrderAfterCompletePayload {
  order: Order & { items: OrderItem[]; payments: Payment[] };
}

export interface OrderAfterVoidPayload {
  order: Order & { items: OrderItem[] };
}

export type HookPayloadMap = {
  'order:before-create': OrderCreatePayload;
  'order:after-create': OrderAfterCreatePayload;
  'order:before-complete': OrderCompletePayload;
  'order:after-complete': OrderAfterCompletePayload;
  'order:before-void': OrderVoidPayload;
  'order:after-void': OrderAfterVoidPayload;
};

// ─── Hook context ─────────────────────────────────────────────────────────────

export interface HookContext<T> {
  /** The mutable payload for this event. Handlers may mutate this. */
  payload: T;
  /** Arbitrary metadata handlers can attach for downstream hooks. */
  meta: Record<string, unknown>;
}

/**
 * A hook handler receives the current context and returns the (possibly
 * mutated) context. Throwing aborts the pipeline with that error.
 */
export type HookHandler<T> = (ctx: HookContext<T>) => Promise<HookContext<T>>;
