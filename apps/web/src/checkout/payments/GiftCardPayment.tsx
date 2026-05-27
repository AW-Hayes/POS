import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { CreditCard } from 'lucide-react';
import type { PaymentStepProps } from '../types';

interface GiftCard {
  id: string;
  code: string;
  balance: number;
  active: boolean;
}

export function GiftCardPayment({ amountDue, onCollected, onCancel }: PaymentStepProps) {
  const [code, setCode] = useState('');
  const [lookedUp, setLookedUp] = useState<GiftCard | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [amountInput, setAmountInput] = useState('');

  const maxAmount = lookedUp ? Math.min(lookedUp.balance, amountDue) : 0;
  const applyAmount = amountInput ? Math.min(parseFloat(amountInput) || 0, maxAmount) : maxAmount;

  async function lookup() {
    setLookupError('');
    setLookedUp(null);
    if (!code.trim()) return;
    try {
      const res = await api.get(`/gift-cards/lookup`, { params: { code: code.trim() } });
      const card: GiftCard = res.data.data;
      if (!card.active) {
        setLookupError('This gift card has been voided.');
        return;
      }
      if (card.balance <= 0) {
        setLookupError('This gift card has no remaining balance.');
        return;
      }
      setLookedUp(card);
      setAmountInput(String(Math.min(card.balance, amountDue)));
    } catch {
      setLookupError('Gift card not found.');
    }
  }

  function apply() {
    if (!lookedUp || applyAmount <= 0) return;
    onCollected({ method: 'gift_card', amount: applyAmount, reference: lookedUp.code });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gc-code">Gift Card Code</Label>
        <div className="flex gap-2">
          <Input
            id="gc-code"
            value={code}
            onChange={(e) => { setCode(e.target.value); setLookedUp(null); setLookupError(''); }}
            placeholder="Enter code…"
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
            autoFocus
          />
          <Button type="button" onClick={lookup} disabled={!code.trim()}>
            Look Up
          </Button>
        </div>
        {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
      </div>

      {lookedUp && (
        <>
          <div className="rounded-md border bg-muted/30 p-4 space-y-1 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="font-medium">{lookedUp.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Available balance</span>
              <span className="font-semibold">{formatCurrency(lookedUp.balance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount due</span>
              <span>{formatCurrency(amountDue)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gc-amount">Amount to apply</Label>
            <Input
              id="gc-amount"
              type="number"
              min="0.01"
              max={maxAmount}
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Max: {formatCurrency(maxAmount)}</p>
          </div>
        </>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!lookedUp || applyAmount <= 0}
          onClick={apply}
        >
          Apply {lookedUp ? formatCurrency(applyAmount) : ''}
        </Button>
      </div>
    </div>
  );
}
