import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Loader2 } from 'lucide-react';
import type { PaymentStepProps } from '../types';

/**
 * Card payment stub. In production this component would:
 *  - Connect to a payment terminal SDK (Square, Stripe Terminal, Adyen, etc.)
 *  - Display terminal status (waiting, processing, approved, declined)
 *  - Pass back a transaction reference
 *
 * Register your own card payment method to replace this:
 *   paymentMethodRegistry.register({ id: 'card', ..., component: MyCardFlow })
 */
export function CardPayment({ amountDue, onCollected, onCancel }: PaymentStepProps) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'approved'>('idle');

  function simulateApproval() {
    setStatus('processing');
    // Simulate terminal response (replace with real terminal SDK call)
    setTimeout(() => {
      setStatus('approved');
      setTimeout(() => {
        onCollected({ method: 'card', amount: amountDue, reference: `SIM-${Date.now()}` });
      }, 800);
    }, 1500);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Charge to card</p>
        <p className="text-4xl font-bold tabular-nums">{formatCurrency(amountDue)}</p>
      </div>

      <div className="rounded-lg border-2 border-dashed p-8 flex flex-col items-center gap-3 text-muted-foreground">
        {status === 'idle' && (
          <>
            <CreditCard className="h-10 w-10" />
            <p className="text-sm text-center">
              Present card to terminal or use the simulate button below.
            </p>
          </>
        )}
        {status === 'processing' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium">Processing…</p>
          </>
        )}
        {status === 'approved' && (
          <>
            <div className="rounded-full bg-green-100 p-3">
              <CreditCard className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-600">Approved</p>
          </>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={status !== 'idle'}>
          Back
        </Button>
        <Button
          className="flex-1 h-12"
          onClick={simulateApproval}
          disabled={status !== 'idle'}
        >
          {status === 'idle' ? `Simulate Approval` : 'Processing…'}
        </Button>
      </div>
    </div>
  );
}
