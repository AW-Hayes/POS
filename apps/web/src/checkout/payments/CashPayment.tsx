import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import type { PaymentStepProps } from '../types';

// Quick-tender amounts relative to the total
const QUICK_AMOUNTS = [0, 5, 10, 20, 50, 100];

export function CashPayment({ amountDue, onCollected, onCancel }: PaymentStepProps) {
  const [tendered, setTendered] = useState('');

  const tenderedNum = parseFloat(tendered) || 0;
  const change = Math.max(0, tenderedNum - amountDue);
  const canCharge = tenderedNum >= amountDue;

  function handleCharge() {
    if (!canCharge) return;
    onCollected({ method: 'cash', amount: amountDue });
  }

  // Compute quick-tender buttons: round up to nice amounts above the total
  const quickOptions = QUICK_AMOUNTS.filter((a) => a === 0 || a >= amountDue)
    .slice(0, 4)
    .map((a) => (a === 0 ? amountDue : a));

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Amount due</p>
        <p className="text-4xl font-bold tabular-nums">{formatCurrency(amountDue)}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tendered">Cash tendered</Label>
        <Input
          id="tendered"
          type="number"
          min={0}
          step="0.01"
          placeholder={formatCurrency(amountDue)}
          value={tendered}
          onChange={(e) => setTendered(e.target.value)}
          className="text-lg h-12 tabular-nums"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCharge()}
        />
      </div>

      {/* Quick-tender buttons */}
      <div className="grid grid-cols-4 gap-2">
        {quickOptions.map((amount) => (
          <Button
            key={amount}
            variant="outline"
            onClick={() => setTendered(amount.toFixed(2))}
            className="h-12"
          >
            {formatCurrency(amount)}
          </Button>
        ))}
      </div>

      {tenderedNum > 0 && (
        <div className="flex justify-between items-center rounded-md bg-muted px-4 py-3">
          <span className="text-sm font-medium">Change due</span>
          <span className={`text-xl font-bold tabular-nums ${change > 0 ? 'text-green-600' : ''}`}>
            {formatCurrency(change)}
          </span>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Back
        </Button>
        <Button className="flex-1 h-12 text-base" disabled={!canCharge} onClick={handleCharge}>
          Confirm {formatCurrency(amountDue)}
        </Button>
      </div>
    </div>
  );
}
