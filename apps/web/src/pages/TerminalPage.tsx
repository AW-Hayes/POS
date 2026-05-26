import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTerminalStore } from '@/stores/terminal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Search, Plus, Minus, Trash2, Monitor, Tablet, AlertCircle } from 'lucide-react';
import type { Product } from '@pos/types';
import { CheckoutModal } from '@/checkout';
import type { CartItem } from '@/checkout';

export function TerminalPage() {
  const { mode, setMode, locationId, sessionId } = useTerminalStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const isTouch = mode === 'touch';

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'terminal', search, selectedCategory],
    queryFn: () =>
      api
        .get('/products', {
          params: { q: search || undefined, categoryId: selectedCategory || undefined, pageSize: 80 },
        })
        .then((r) => r.data.data as Product[]),
  });

  const addToCart = useCallback((product: Product, variantId?: string) => {
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
    const price = variant?.price ?? product.price;
    const name =
      product.name +
      (variant
        ? ` (${variant.attributeValues.map((v) => v.value).join(' / ')})`
        : '');

    setCart((prev) => {
      const key = variantId ?? product.id;
      const existing = prev.find((i) => (variantId ? i.variantId === key : i.productId === key && !i.variantId));
      if (existing) {
        return prev.map((i) =>
          (variantId ? i.variantId === key : i.productId === key && !i.variantId)
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          variantId,
          name,
          sku: variant?.sku ?? product.sku ?? undefined,
          price,
          quantity: 1,
          discount: 0,
        },
      ];
    });
  }, []);

  function updateQty(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item, i) => (i === index ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  const subtotal = cart.reduce((s, i) => s + (i.price - i.discount) * i.quantity, 0);

  function handleOrderComplete() {
    setCart([]);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }

  return (
    <div className={cn('flex h-full', isTouch ? 'terminal-touch' : '')}>
      {/* ── Product browser ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col border-r overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search products or scan barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            title={isTouch ? 'Switch to desktop mode' : 'Switch to touch mode'}
            onClick={() => setMode(isTouch ? 'desktop' : 'touch')}
          >
            {isTouch ? <Monitor className="h-4 w-4" /> : <Tablet className="h-4 w-4" />}
          </Button>
        </div>

        {/* Category tabs */}
        {categories && categories.length > 0 && (
          <div className="flex gap-2 px-3 py-2 border-b overflow-x-auto">
            <Button
              size="sm"
              variant={selectedCategory === null ? 'default' : 'outline'}
              onClick={() => setSelectedCategory(null)}
            >
              All
            </Button>
            {categories.map((cat: { id: string; name: string }) => (
              <Button
                key={cat.id}
                size="sm"
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        )}

        {/* Product grid */}
        <div
          className={cn(
            'flex-1 overflow-y-auto p-3 grid gap-2',
            isTouch
              ? 'grid-cols-2 sm:grid-cols-3'
              : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5',
          )}
        >
          {productsData?.map((product) => {
            const hasVariants = product.variants.length > 0;
            return (
              <Card
                key={product.id}
                className={cn(
                  'cursor-pointer hover:border-primary transition-colors select-none',
                  isTouch ? 'min-h-[5rem]' : '',
                )}
                onClick={() => {
                  if (!hasVariants) addToCart(product);
                  // TODO: variant picker modal for products with variants
                }}
              >
                <CardContent className={cn('p-3 flex flex-col gap-1', isTouch ? 'p-4' : '')}>
                  <p className={cn('font-medium leading-tight', isTouch ? 'text-base' : 'text-sm')}>
                    {product.name}
                  </p>
                  <p className="text-primary font-semibold text-sm">
                    {formatCurrency(product.price)}
                  </p>
                  {product.sku && (
                    <p className="text-xs text-muted-foreground">{product.sku}</p>
                  )}
                  {hasVariants && (
                    <Badge variant="secondary" className="text-xs w-fit mt-1">
                      {product.variants.length} variants
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {productsData?.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">
              No products found
            </div>
          )}
        </div>
      </div>

      {/* ── Cart ────────────────────────────────────────────────────────────── */}
      <div className="w-80 flex flex-col bg-muted/20">
        <div className="p-3 border-b font-semibold flex items-center justify-between">
          <span>Order</span>
          {!locationId && (
            <span className="flex items-center gap-1 text-xs font-normal text-amber-600">
              <AlertCircle className="h-3 w-3" />
              No register selected
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {cart.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">Cart is empty</p>
          )}
          {cart.map((item, i) => (
            <div key={i} className="bg-background rounded-md p-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(item.price)} each
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-6 w-6"
                  onClick={() => updateQty(i, -1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-5 text-center text-sm font-medium">{item.quantity}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-6 w-6"
                  onClick={() => updateQty(i, 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => setCart((prev) => prev.filter((_, idx) => idx !== i))}
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

        {/* Totals + checkout */}
        <div className="border-t p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          <Button
            className="w-full"
            size={isTouch ? 'xl' : 'lg'}
            disabled={cart.length === 0 || !locationId}
            onClick={() => setCheckoutOpen(true)}
          >
            Charge {cart.length > 0 && formatCurrency(subtotal)}
          </Button>
          {cart.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setCart([])}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ── Checkout pipeline modal ──────────────────────────────────────────── */}
      <CheckoutModal
        open={checkoutOpen}
        initialCart={cart}
        locationId={locationId ?? ''}
        sessionId={sessionId ?? undefined}
        onClose={() => setCheckoutOpen(false)}
        onOrderComplete={handleOrderComplete}
      />
    </div>
  );
}
