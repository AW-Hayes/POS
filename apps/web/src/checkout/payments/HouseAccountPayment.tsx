import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, AlertTriangle } from 'lucide-react';
import type { PaymentStepProps } from '../types';

export function HouseAccountPayment({ amountDue, state, onCollected, onCancel }: PaymentStepProps) {
  const { data: arData, isLoading } = useQuery({
    queryKey: ['house-account', state.customerId],
    enabled: !!state.customerId,
    queryFn: () =>
      api.get(`/house-accounts/customers/${state.customerId}`).then((r) => r.data.data),
  });

  if (!state.customerId) {
    return (
      <div className="space-y-4 text-center py-8">
        <CreditCard className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">No customer attached. Add a customer to charge to a house account.</p>
        <Button variant="outline" onClick={onCancel}>Back</Button>
      </div>
    );
  }

  const arBalance: number = arData?.arBalance ?? 0;
  const creditLimit: number | null = arData?.creditLimit ?? null;
  const availableCredit = creditLimit != null ? creditLimit - arBalance : Infinity;
  const canCharge = availableCredit >= amountDue;

  function handleCharge() {
    onCollected({ method: 'house_account', amount: amountDue, reference: `AR — ${state.customerName}` });
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Amount due</p>
        <p className="text-4xl font-bold tabular-nums">{formatCurrency(amountDue)}</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm text-center">Loading account…</p>
      ) : (
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <p className="font-semibold">{state.customerName} — House Account</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current Balance</span>
            <span className="font-medium">{formatCurrency(arBalance)}</span>
          </div>
          {creditLimit != null && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit Limit</span>
                <span>{formatCurrency(creditLimit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available Credit</span>
                <span className={availableCredit < amountDue ? 'text-red-600 font-semibold' : 'text-green-600'}>
                  {formatCurrency(availableCredit)}
                </span>
              </div>
            </>
          )}
          {!canCharge && (
            <div className="flex items-center gap-2 text-red-600 mt-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Insufficient credit — charge would exceed the limit.</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>New Balance After Charge</span>
            <span>{formatCurrency(arBalance + amountDue)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Back</Button>
        <Button
          className="flex-1 h-12 text-base"
          disabled={!canCharge || isLoading}
          onClick={handleCharge}
        >
          Charge to Account
        </Button>
      </div>
    </div>
  );
}
