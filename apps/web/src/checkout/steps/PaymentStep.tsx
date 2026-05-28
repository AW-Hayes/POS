import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Check } from 'lucide-react';
import { paymentMethodRegistry } from '../registry';
import type { StepProps, PaymentEntry } from '../types';

export function PaymentStep({ state, onAdvance, onBack }: StepProps) {
  const [activeMethodId, setActiveMethodId] = useState<string | null>(null);
  const [collectedPayments, setCollectedPayments] = useState<PaymentEntry[]>(
    state.payments ?? [],
  );

  const methods = paymentMethodRegistry.getAll();
  const activeMethod = methods.find((m) => m.id === activeMethodId);

  const subtotal = state.cart.reduce((s, i) => s + (i.price - i.discount) * i.quantity, 0);
  const tipAmount = (state.meta.tipAmount as number) ?? 0;
  const grandTotal = subtotal + tipAmount;
  const totalPaid = collectedPayments.reduce((s, p) => s + p.amount, 0);
  const amountDue = Math.max(0, grandTotal - totalPaid);
  const change = Math.max(0, totalPaid - grandTotal);
  const isPaid = totalPaid >= grandTotal;

  function handleCollected(entry: PaymentEntry) {
    setCollectedPayments((prev) => [...prev, entry]);
    setActiveMethodId(null);
  }

  function removePayment(index: number) {
    setCollectedPayments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm() {
    onAdvance({ payments: collectedPayments });
  }

  // If a payment method component is active, render it full-width
  if (activeMethod) {
    const PaymentComponent = activeMethod.component;
    return (
      <PaymentComponent
        amountDue={amountDue}
        state={state}
        onCollected={handleCollected}
        onCancel={() => setActiveMethodId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Amount summary */}
      <div className="rounded-lg bg-muted/40 p-4 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        {tipAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tip</span>
            <span className="tabular-nums">{formatCurrency(tipAmount)}</span>
          </div>
        )}
        {collectedPayments.length > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Paid</span>
            <span className="tabular-nums">−{formatCurrency(totalPaid)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t pt-1 mt-1">
          <span>{isPaid ? 'Change due' : 'Amount due'}</span>
          <span className={`tabular-nums text-lg ${isPaid ? 'text-green-600' : ''}`}>
            {formatCurrency(isPaid ? change : amountDue)}
          </span>
        </div>
      </div>

      {/* Payments collected so far */}
      {collectedPayments.length > 0 && (
        <div className="space-y-1">
          {collectedPayments.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              <span className="flex-1 capitalize">{p.method}</span>
              {p.reference && (
                <Badge variant="outline" className="text-xs">{p.reference}</Badge>
              )}
              <span className="tabular-nums font-medium">{formatCurrency(p.amount)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground"
                onClick={() => removePayment(i)}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Payment method picker (only shown if more payment is needed) */}
      {!isPaid && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Select payment method</p>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((method) => {
              const Icon = method.icon;
              return (
                <Button
                  key={method.id}
                  variant="outline"
                  className="h-16 flex-col gap-1"
                  onClick={() => setActiveMethodId(method.id)}
                >
                  {Icon ? <Icon className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                  <span className="text-sm">{method.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1 h-12 text-base" disabled={!isPaid} onClick={handleConfirm}>
          {isPaid ? 'Complete Order' : `${formatCurrency(amountDue)} remaining`}
        </Button>
      </div>
    </div>
  );
}
