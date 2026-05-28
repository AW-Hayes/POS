import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { Minus, Plus, Trash2, Tag, X, ChevronDown, Gift } from 'lucide-react';
import type { StepProps, CartItem } from '../types';

interface Promotion {
  id: string;
  name: string;
  type: string;
  value: number;
}

export function CartReviewStep({ state, onAdvance, onAbort }: StepProps) {
  const { cart } = state;
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoSearch, setPromoSearch] = useState('');
  const [selectedPromos, setSelectedPromos] = useState<Promotion[]>(
    (state.meta.selectedPromos as Promotion[]) ?? [],
  );
  const [giftReceipt, setGiftReceipt] = useState<boolean>(
    (state.meta.giftReceipt as boolean) ?? false,
  );

  const { data: promotionsData } = useQuery({
    queryKey: ['promotions-active'],
    queryFn: () => api.get('/promotions', { params: { active: 'true' } }).then((r) => r.data.data as Promotion[]),
    enabled: promoOpen,
  });

  const allPromos: Promotion[] = promotionsData ?? [];
  const filteredPromos = promoSearch
    ? allPromos.filter((p) => p.name.toLowerCase().includes(promoSearch.toLowerCase()))
    : allPromos;
  const selectedIds = new Set(selectedPromos.map((p) => p.id));

  function togglePromo(promo: Promotion) {
    setSelectedPromos((prev) =>
      prev.some((p) => p.id === promo.id)
        ? prev.filter((p) => p.id !== promo.id)
        : [...prev, promo],
    );
  }

  function promoLabel(p: Promotion) {
    if (p.type === 'percent_off') return `${p.value}% off`;
    if (p.type === 'fixed_off') return `$${p.value} off`;
    if (p.type === 'bogo') return 'BOGO';
    return p.type;
  }

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

  function handleContinue() {
    onAdvance({
      meta: {
        ...state.meta,
        promotionIds: selectedPromos.map((p) => p.id),
        selectedPromos,
        giftReceipt,
      },
    });
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
      <div className="divide-y max-h-52 overflow-y-auto">
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

      {/* Promotions accordion */}
      <div className="border rounded-md overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
          onClick={() => setPromoOpen((v) => !v)}
        >
          <span className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            Promotions
            {selectedPromos.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{selectedPromos.length} applied</Badge>
            )}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${promoOpen ? 'rotate-180' : ''}`} />
        </button>

        {promoOpen && (
          <div className="border-t px-3 py-2 space-y-2">
            {selectedPromos.length > 0 && (
              <div className="flex flex-wrap gap-1 pb-1">
                {selectedPromos.map((p) => (
                  <Badge key={p.id} variant="secondary" className="gap-1 pr-1">
                    {p.name} · {promoLabel(p)}
                    <button
                      type="button"
                      className="ml-0.5 hover:text-destructive"
                      onClick={() => togglePromo(p)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <input
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Search promotions…"
              value={promoSearch}
              onChange={(e) => setPromoSearch(e.target.value)}
            />

            <div className="max-h-32 overflow-y-auto divide-y text-sm">
              {filteredPromos.length === 0 && (
                <p className="py-2 text-center text-muted-foreground text-xs">
                  {allPromos.length === 0 ? 'No active promotions' : 'No matches'}
                </p>
              )}
              {filteredPromos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 transition-colors text-left ${selectedIds.has(p.id) ? 'bg-primary/5 font-medium' : ''}`}
                  onClick={() => togglePromo(p)}
                >
                  <span>{p.name}</span>
                  <span className="text-muted-foreground text-xs">{promoLabel(p)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Gift receipt toggle */}
      <button
        type="button"
        onClick={() => setGiftReceipt((v) => !v)}
        className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${giftReceipt ? 'border-primary bg-primary/5 text-primary' : 'border-input hover:bg-muted/50'}`}
      >
        <span className="flex items-center gap-2">
          <Gift className="h-4 w-4" />
          Gift receipt (hide prices)
        </span>
        <div className={`h-5 w-9 rounded-full transition-colors relative ${giftReceipt ? 'bg-primary' : 'bg-muted'}`}>
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${giftReceipt ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </button>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onAbort}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
