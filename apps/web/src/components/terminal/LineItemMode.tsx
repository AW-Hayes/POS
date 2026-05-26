import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { Trash2, Search, AlertCircle } from 'lucide-react';
import type { CartItem } from '@/checkout';
import type { Product } from '@pos/types';

interface Props {
  cart: CartItem[];
  onAddToCart: (product: Product, variantId?: string) => void;
  onUpdateQty: (index: number, qty: number) => void;
  onRemove: (index: number) => void;
  onVariantRequired: (product: Product) => void;
}

export function LineItemMode({ cart, onAddToCart, onUpdateQty, onRemove, onVariantRequired }: Props) {
  const [skuInput, setSkuInput] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const subtotal = cart.reduce((s, i) => s + (i.price - i.discount) * i.quantity, 0);

  const handleSkuLookup = useCallback(async () => {
    const val = skuInput.trim();
    if (!val) return;
    setIsLooking(true);
    setLookupError(null);
    try {
      // Try exact SKU match, then exact barcode match
      const { data: res } = await api.get('/products', { params: { sku: val, pageSize: 1 } });
      let product: Product | undefined = res.data?.[0];

      if (!product) {
        const { data: res2 } = await api.get('/products', { params: { barcode: val, pageSize: 1 } });
        product = res2.data?.[0];
      }

      if (!product) {
        setLookupError(`No product found for "${val}"`);
        return;
      }

      if (product.variants.length > 0) {
        onVariantRequired(product);
      } else {
        onAddToCart(product);
      }
      setSkuInput('');
      inputRef.current?.focus();
    } catch {
      setLookupError('Lookup failed. Check your connection.');
    } finally {
      setIsLooking(false);
    }
  }, [skuInput, onAddToCart, onVariantRequired]);

  return (
    <div className="flex flex-col h-full">
      {/* SKU entry bar */}
      <div className="p-3 border-b space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              autoFocus
              className="pl-9 font-mono"
              placeholder="Scan barcode or type SKU…"
              value={skuInput}
              onChange={(e) => { setSkuInput(e.target.value); setLookupError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSkuLookup()}
            />
          </div>
          <Button onClick={handleSkuLookup} disabled={isLooking || !skuInput.trim()}>
            {isLooking ? 'Looking…' : 'Add'}
          </Button>
        </div>
        {lookupError && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {lookupError}
          </p>
        )}
      </div>

      {/* Line item table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left py-2 px-3 font-medium">Description</th>
              <th className="text-center py-2 px-2 font-medium w-20">Qty</th>
              <th className="text-right py-2 px-2 font-medium w-24">Unit</th>
              <th className="text-right py-2 px-3 font-medium w-24">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {cart.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted-foreground">
                  Scan or type a SKU to begin
                </td>
              </tr>
            )}
            {cart.map((item, i) => (
              <tr key={i} className="hover:bg-muted/30 transition-colors">
                <td className="py-2 px-3">
                  <p className="font-medium">{item.name}</p>
                  {item.sku && <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>}
                </td>
                <td className="py-2 px-2 text-center">
                  <Input
                    type="number"
                    min={1}
                    className="h-7 w-16 text-center mx-auto tabular-nums"
                    value={item.quantity}
                    onChange={(e) => {
                      const q = parseInt(e.target.value, 10);
                      if (q > 0) onUpdateQty(i, q);
                    }}
                  />
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {formatCurrency(item.price - item.discount)}
                </td>
                <td className="py-2 px-3 text-right font-semibold tabular-nums">
                  {formatCurrency((item.price - item.discount) * item.quantity)}
                </td>
                <td className="py-2 pr-2">
                  <button
                    onClick={() => onRemove(i)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Subtotal footer */}
      {cart.length > 0 && (
        <div className="border-t px-3 py-2 flex justify-between text-sm bg-muted/20">
          <span className="text-muted-foreground">{cart.reduce((n, i) => n + i.quantity, 0)} item(s)</span>
          <span className="font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
      )}
    </div>
  );
}
