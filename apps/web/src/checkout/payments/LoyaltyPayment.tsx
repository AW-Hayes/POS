import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { Star } from 'lucide-react';
import type { PaymentStepProps } from '../types';

// Configurable: how many points equal $1 in discount
const POINTS_PER_DOLLAR = 100;

export function LoyaltyPayment({ amountDue, state, onCollected, onCancel }: PaymentStepProps) {
  const [pointsToRedeem, setPointsToRedeem] = useState('');

  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty', state.customerId],
    enabled: !!state.customerId,
    queryFn: () =>
      api.get(`/loyalty/customers/${state.customerId}`).then((r) => r.data.data),
  });

  const balance: number = loyaltyData?.loyaltyPoints ?? 0;
  const maxRedeemable = Math.min(balance, Math.ceil(amountDue * POINTS_PER_DOLLAR));
  const pointsNum = Math.min(Number(pointsToRedeem) || 0, maxRedeemable);
  const dollarValue = pointsNum / POINTS_PER_DOLLAR;
  const canRedeem = pointsNum > 0;

  function handleRedeem() {
    if (!canRedeem) return;
    onCollected({ method: 'store_credit', amount: dollarValue, reference: `${pointsNum} loyalty pts` });
  }

  if (!state.customerId) {
    return (
      <div className="space-y-4 text-center py-8">
        <Star className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">No customer attached. Add a customer to use loyalty points.</p>
        <Button variant="outline" onClick={onCancel}>Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Amount due</p>
        <p className="text-4xl font-bold tabular-nums">{formatCurrency(amountDue)}</p>
      </div>

      <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 flex items-center gap-3">
        <Star className="h-5 w-5 text-yellow-500 shrink-0" />
        <div>
          <p className="font-semibold">{state.customerName}</p>
          <p className="text-sm text-muted-foreground">{balance.toLocaleString()} points available ({formatCurrency(balance / POINTS_PER_DOLLAR)} value)</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Points to redeem (max {maxRedeemable.toLocaleString()})</label>
        <Input
          type="number"
          min={0}
          max={maxRedeemable}
          value={pointsToRedeem}
          onChange={(e) => setPointsToRedeem(e.target.value)}
          placeholder={`0 – ${maxRedeemable}`}
          autoFocus
        />
        {pointsNum > 0 && (
          <p className="text-sm text-green-600">= {formatCurrency(dollarValue)} discount</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Back</Button>
        <Button className="flex-1 h-12 text-base" disabled={!canRedeem} onClick={handleRedeem}>
          Redeem {pointsNum > 0 ? `${pointsNum.toLocaleString()} pts` : ''}
        </Button>
      </div>
    </div>
  );
}
