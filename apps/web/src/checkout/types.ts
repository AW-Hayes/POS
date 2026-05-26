import type React from 'react';

// ─── Cart ─────────────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  discount: number;
  requiresAgeVerification?: boolean;
}

// ─── Checkout state ────────────────────────────────────────────────────────────

export interface PaymentEntry {
  method: string;
  amount: number;
  reference?: string;
}

export interface CheckoutState {
  /** Items in the cart. */
  cart: CartItem[];
  locationId: string;
  sessionId?: string;
  /** Customer attached to this order. */
  customerId?: string;
  customerName?: string;
  /** Payments collected so far (may be partial / split-tender). */
  payments: PaymentEntry[];
  /** The created order ID, set after order:create succeeds. */
  orderId?: string;
  /** Arbitrary metadata — custom steps can store anything here. */
  meta: Record<string, unknown>;
}

// ─── Pipeline step ─────────────────────────────────────────────────────────────

export interface StepProps {
  state: CheckoutState;
  /** Advance to the next step, optionally patching state. */
  onAdvance: (patch?: Partial<CheckoutState>) => void;
  /** Go back one step. */
  onBack: () => void;
  /** Abort the entire checkout pipeline. */
  onAbort: () => void;
}

export interface CheckoutStep {
  /** Unique identifier — used to target this step for insertion/removal. */
  id: string;
  /** Human-readable label shown in the progress indicator. */
  label: string;
  /** The React component rendered for this step. */
  component: React.ComponentType<StepProps>;
  /**
   * Optional predicate — if it returns false, this step is skipped.
   * Evaluated each time the pipeline advances.
   */
  condition?: (state: CheckoutState) => boolean;
}

// ─── Payment method ────────────────────────────────────────────────────────────

export interface PaymentStepProps {
  /** Amount still owed (total − payments already collected). */
  amountDue: number;
  /** Full checkout state for context (e.g. display customer name). */
  state: CheckoutState;
  /** Call with the payment to record it and continue. */
  onCollected: (entry: PaymentEntry) => void;
  /** Cancel and return to payment method selection. */
  onCancel: () => void;
}

export interface PaymentMethod {
  /** Unique identifier (e.g. "cash", "card", "store_credit"). */
  id: string;
  /** Display label. */
  label: string;
  /** Optional icon component. */
  icon?: React.ComponentType<{ className?: string }>;
  /** The component that collects this payment. */
  component: React.ComponentType<PaymentStepProps>;
}

// ─── Pipeline hooks ────────────────────────────────────────────────────────────

export type PipelineHookName =
  | 'pipeline:before-start'
  | 'pipeline:step-complete'
  | 'pipeline:before-submit'
  | 'pipeline:after-submit';

export type PipelineHookHandler = (state: CheckoutState) => Promise<CheckoutState | void>;
