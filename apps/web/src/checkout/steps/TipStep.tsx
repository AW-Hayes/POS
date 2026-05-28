import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import type { StepProps } from '../types';

const TIP_PRESETS = [0, 15, 18, 20, 25]; // percent

export function TipStep({ state, onAdvance, onBack }: StepProps) {
  const subtotal = state.cart.reduce((s, i) => s + (i.price - i.discount) * i.quantity, 0);
  const [selectedPct, setSelectedPct] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');

  const tipAmount =
    selectedPct !== null
      ? parseFloat(((subtotal * selectedPct) / 100).toFixed(2))
      : parseFloat(customTip) || 0;

  function handlePreset(pct: number) {
    setSelectedPct(pct);
    setCustomTip('');
  }

  function handleCustomChange(val: string) {
    setSelectedPct(null);
    setCustomTip(val);
  }

  function handleAdvance() {
    onAdvance({ meta: { ...state.meta, tipAmount } });
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Add a tip?</p>
        <p className="text-3xl font-bold tabular-nums">{formatCurrency(subtotal)}</p>
        <p className="text-xs text-muted-foreground mt-1">Subtotal before tip</p>
      </div>

      {/* Preset buttons */}
      <div className="grid grid-cols-5 gap-2">
        {TIP_PRESETS.map((pct) => (
          <Button
            key={pct}
            variant={selectedPct === pct ? 'default' : 'outline'}
            className="flex flex-col h-16 gap-0.5"
            onClick={() => handlePreset(pct)}
          >
            <span className="text-sm font-semibold">{pct === 0 ? 'No tip' : `${pct}%`}</span>
            {pct > 0 && (
              <span className="text-xs opacity-70 tabular-nums">
                {formatCurrency((subtotal * pct) / 100)}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground">Custom amount</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={customTip}
            onChange={(e) => handleCustomChange(e.target.value)}
            className="pl-7 h-11 tabular-nums"
          />
        </div>
      </div>

      {tipAmount > 0 && (
        <div className="flex justify-between items-center rounded-md bg-muted px-4 py-3">
          <span className="text-sm font-medium">Tip</span>
          <span className="text-xl font-bold tabular-nums text-primary">{formatCurrency(tipAmount)}</span>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1 h-12 text-base" onClick={handleAdvance}>
          {tipAmount > 0 ? `Continue (+${formatCurrency(tipAmount)})` : 'No Tip — Continue'}
        </Button>
      </div>
    </div>
  );
}
