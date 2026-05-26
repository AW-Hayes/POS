import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { StepProps, CartItem } from '../types';

export function CartReviewStep({ state, onAdvance, onAbort }: StepProps) {
  const { cart } = state;

  const subtotal = cart.reduce((s, i) => s + (i.price - i.discount) * i.quantity, 0);

  function updateQty(index: number, delta: number) {
    const updated = cart
      .map((item, i) => (i === index ? { ...item, quantity: item.quantity + delta } : item))
      .filter((item) => item.quantity > 0);
    onAdvance({ cart: updated });
  }

  function removeItem(index: number) {
    onAdvance({ cart: cart.filter((_, i) => i !== index) });
  }

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-muted-foreground">
        <p>Cart is empty.</p>
        <Button variant="outline" onClick={onAbort}>Cancel</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="divide-y max-h-64 overflow-y-auto">
        {cart.map((item: CartItem, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.name}</p>
              {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
              {item.discount > 0 && (
                <p className="text-xs text-green-600">
                  -{formatCurrency(item.discount)}/ea
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(i, -1)}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(i, 1)}>
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                onClick={() => removeItem(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <span className="text-sm font-semibold w-16 text-right tabular-nums">
              {formatCurrency((item.price - item.discount) * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t pt-3 space-y-1">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onAbort}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={() => onAdvance()}>
          Continue
        </Button>
      </div>
    </div>
  );
}
