import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Banknote, Check } from 'lucide-react';
import { paymentMethodRegistry } from '../registry';
import type { StepProps, PaymentEntry } from '../types';

export function PaymentStep({ state, onAdvance, onBack }: StepProps) {
  const [activeMethodId, setActiveMethodId] = useState<string | null>(null);
  const [collectedPayments, setCollectedPayments] = useState<PaymentEntry[]>(
    state.payments ?? [],
  );
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [customTipInput, setCustomTipInput] = useState('');
  const [showCustomTip, setShowCustomTip] = useState(false);

  const methods = paymentMethodRegistry.getAll();
  const activeMethod = methods.find((m) => m.id === activeMethodId);

  const subtotal = state.cart.reduce((s, i) => s + (i.price - i.discount) * i.quantity, 0);
  const grandTotal = subtotal + tipAmount;
  const totalPaid = collectedPayments.reduce((s, p) => s + p.amount, 0);
  const amountDue = Math.max(0, grandTotal - totalPaid);
  const change = Math.max(0, totalPaid - grandTotal);
  const isPaid = totalPaid >= grandTotal;

  function selectTip(pct: number | 'custom') {
    if (pct === 'custom') {
      setShowCustomTip(true);
    } else {
      setTipAmount(Math.round(subtotal * pct) / 100);
      setShowCustomTip(false);
    }
  }

  function applyCustomTip() {
    const val = parseFloat(customTipInput);
    if (!isNaN(val) && val >= 0) setTipAmount(val);
    setShowCustomTip(false);
  }

  function handleCollected(entry: PaymentEntry) {
    setCollectedPayments((prev) => [...prev, entry]);
    setActiveMethodId(null);
  }

  function removePayment(index: number) {
    setCollectedPayments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm() {
    onAdvance({ payments: collectedPayments, meta: { ...state.meta, tipAmount } });
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
      {/* Tip selection */}
      <div className="rounded-lg bg-muted/40 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Add a tip?</p>
        <div className="flex gap-2 flex-wrap">
          {([0, 15, 18, 20] as const).map((pct) => (
            <Button
              key={pct}
              size="sm"
              variant={tipAmount === (pct === 0 ? 0 : Math.round(subtotal * pct) / 100) && !showCustomTip ? 'default' : 'outline'}
              onClick={() => pct === 0 ? (setTipAmount(0), setShowCustomTip(false)) : selectTip(pct)}
            >
              {pct === 0 ? 'None' : `${pct}%`}
            </Button>
          ))}
          <Button size="sm" variant={showCustomTip ? 'default' : 'outline'} onClick={() => selectTip('custom')}>
            Custom
          </Button>
        </div>
        {showCustomTip && (
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={customTipInput}
              onChange={(e) => setCustomTipInput(e.target.value)}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={applyCustomTip}>Apply</Button>
          </div>
        )}
        {tipAmount > 0 && <p className="text-xs text-muted-foreground">Tip: {formatCurrency(tipAmount)}</p>}
      </div>

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
