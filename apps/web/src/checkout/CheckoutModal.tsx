import { useState, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { enqueueOrder } from '@/lib/offlineQueue';
import { pipelineRegistry } from './registry';
import type { CheckoutState, CartItem } from './types';

interface CheckoutModalProps {
  open: boolean;
  initialCart: CartItem[];
  locationId: string;
  sessionId?: string;
  onClose: () => void;
  onOrderComplete: () => void;
}

export function CheckoutModal({
  open,
  initialCart,
  locationId,
  sessionId,
  onClose,
  onOrderComplete,
}: CheckoutModalProps) {
  const user = useAuthStore((s) => s.user);
  const steps = pipelineRegistry.getSteps();

  const [state, setState] = useState<CheckoutState>({
    cart: initialCart,
    locationId,
    sessionId,
    payments: [],
    meta: {},
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setState({ cart: initialCart, locationId, sessionId, payments: [], meta: {} });
      setStepIndex(0);
      setError(null);
    }
  }, [open, initialCart, locationId, sessionId]);

  const submitOrder = useMutation({
    mutationFn: async (finalState: CheckoutState) => {
      // ── pipeline:before-submit hook ────────────────────────────────────────
      const hooked = await pipelineRegistry.runHook('pipeline:before-submit', finalState);

      const orderPayload = {
        locationId: hooked.locationId,
        sessionId: hooked.sessionId,
        customerId: hooked.customerId,
        notes: hooked.meta.notes as string | undefined,
        promotionIds: (hooked.meta.promotionIds as string[] | undefined) ?? [],
        items: hooked.cart.map((item) => ({
          ...(item.productId ? { productId: item.productId } : {}),
          variantId: item.variantId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount,
        })),
      };

      // Offline: queue locally and continue to receipt step
      if (!navigator.onLine) {
        const localId = await enqueueOrder({ ...orderPayload, payments: hooked.payments });
        const orderId = `offline:${localId}`;
        await pipelineRegistry.runHook('pipeline:after-submit', { ...hooked, orderId });
        return orderId;
      }

      // Create the order
      const { data: orderRes } = await api.post('/orders', orderPayload);
      const orderId: string = orderRes.data.id;

      // Complete the order with payments
      await api.post(`/orders/${orderId}/complete`, {
        payments: hooked.payments,
        tipAmount: (hooked.meta.tipAmount as number) ?? 0,
      });

      // ── pipeline:after-submit hook ─────────────────────────────────────────
      await pipelineRegistry.runHook('pipeline:after-submit', { ...hooked, orderId });

      return orderId;
    },
    onSuccess: (orderId) => {
      setState((s) => ({ ...s, orderId }));
      // Move to the receipt step (last step)
      setStepIndex(steps.length - 1);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Order failed. Please try again.';
      setError(msg);
    },
  });

  // Compute the active steps (filtered by condition)
  const activeSteps = steps.filter((step) => !step.condition || step.condition(state));

  // Clamp index into active steps
  const activeIndex = Math.min(stepIndex, activeSteps.length - 1);
  const currentStep = activeSteps[activeIndex];

  const handleAdvance = useCallback(
    async (patch?: Partial<CheckoutState>) => {
      const nextState = patch ? { ...state, ...patch } : state;
      setState(nextState);

      const isLastStep = activeIndex >= activeSteps.length - 1;

      // The payment step (second to last) triggers order submission
      const isPaymentStep = currentStep?.id === 'payment';
      if (isPaymentStep) {
        submitOrder.mutate(nextState);
        return;
      }

      if (isLastStep) {
        // Receipt step "New Order" — close and reset
        onOrderComplete();
        onClose();
        return;
      }

      setStepIndex((i) => i + 1);
    },
    [state, activeIndex, activeSteps, currentStep, submitOrder, onOrderComplete, onClose],
  );

  const handleBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!open || !currentStep) return null;

  const StepComponent = currentStep.component;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Progress bar */}
        <div className="flex border-b">
          {activeSteps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                'flex-1 py-2 text-xs font-medium text-center transition-colors',
                i < activeIndex
                  ? 'bg-primary/10 text-primary'
                  : i === activeIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {step.label}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              {error}
              <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          {submitOrder.isPending ? (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm">Processing order…</p>
            </div>
          ) : (
            <StepComponent
              state={state}
              onAdvance={handleAdvance}
              onBack={handleBack}
              onAbort={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
