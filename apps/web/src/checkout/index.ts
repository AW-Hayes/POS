export { CheckoutModal } from './CheckoutModal';
export { pipelineRegistry, paymentMethodRegistry } from './registry';
export type {
  CheckoutStep,
  CheckoutState,
  PaymentMethod,
  StepProps,
  PaymentStepProps,
  CartItem,
  PaymentEntry,
  PipelineHookName,
} from './types';

import { pipelineRegistry, paymentMethodRegistry } from './registry';
import { CartReviewStep } from './steps/CartReviewStep';
import { CustomerStep } from './steps/CustomerStep';
import { AgeVerificationStep } from './steps/AgeVerificationStep';
import { PaymentStep } from './steps/PaymentStep';
import { ReceiptStep } from './steps/ReceiptStep';
import { CashPayment } from './payments/CashPayment';
import { CardPayment } from './payments/CardPayment';
import { Banknote, CreditCard } from 'lucide-react';

/**
 * Register the default checkout pipeline and built-in payment methods.
 * Call once at app startup (main.tsx).
 *
 * To customize the pipeline without forking this file:
 *
 *   import { pipelineRegistry, paymentMethodRegistry } from '@/checkout';
 *
 *   // Add a custom step before payment
 *   pipelineRegistry.insertStepBefore('payment', {
 *     id: 'age-verify',
 *     label: 'Age Verify',
 *     component: AgeVerifyStep,
 *     condition: (state) => state.meta.requiresAgeVerify === true,
 *   });
 *
 *   // Register a custom payment method
 *   paymentMethodRegistry.register({
 *     id: 'loyalty',
 *     label: 'Loyalty Points',
 *     component: LoyaltyPayment,
 *   });
 */
export function initCheckout(): void {
  // ── Default pipeline steps ────────────────────────────────────────────────
  pipelineRegistry.insertStep({ id: 'cart-review', label: 'Review',   component: CartReviewStep });
  pipelineRegistry.insertStep({ id: 'customer',    label: 'Customer', component: CustomerStep });
  pipelineRegistry.insertStep({
    id: 'age-verify',
    label: 'Age Verify',
    component: AgeVerificationStep,
    condition: (state) => state.cart.some((i) => i.requiresAgeVerification),
  });
  pipelineRegistry.insertStep({ id: 'payment',     label: 'Payment',  component: PaymentStep });
  pipelineRegistry.insertStep({ id: 'receipt',     label: 'Receipt',  component: ReceiptStep });

  // ── Default payment methods ───────────────────────────────────────────────
  paymentMethodRegistry.register({ id: 'cash', label: 'Cash', icon: Banknote, component: CashPayment });
  paymentMethodRegistry.register({ id: 'card', label: 'Card', icon: CreditCard, component: CardPayment });
}
