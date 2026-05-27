import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTerminalStore } from '@/stores/terminal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Search, Plus, Minus, Trash2, Tablet,
  AlertCircle, List, Grid3x3, BookOpen, PauseCircle,
  FileText, DollarSign, PackagePlus,
} from 'lucide-react';
import type { Product } from '@pos/types';
import { CheckoutModal } from '@/checkout';
import type { CartItem } from '@/checkout';
import { VariantPickerModal } from '@/components/terminal/VariantPickerModal';
import { LineItemMode } from '@/components/terminal/LineItemMode';
import { QuickFindPanel } from '@/components/terminal/QuickFindPanel';
import type { TerminalMode } from '@pos/types';

interface HeldOrder {
  id: string;
  heldName: string;
  items: Array<{ name: string; quantity: number; price: number; productId?: string; variantId?: string; sku?: string; discount: number }>;
  createdAt: string;
}

export function TerminalPage() {
  const { mode, setMode, locationId, sessionId } = useTerminalStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [heldPanelOpen, setHeldPanelOpen] = useState(false);
  const [holdNameInput, setHoldNameInput] = useState('');
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [miscOpen, setMiscOpen] = useState(false);
  const [miscForm, setMiscForm] = useState({ name: '', price: '', qty: '1' });
  const [miscError, setMiscError] = useState('');
  const [cashDropOpen, setCashDropOpen] = useState(false);
  const [cashDropAmount, setCashDropAmount] = useState('');
  const [cashDropNote, setCashDropNote] = useState('');
  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTouch = mode === 'touch';
  const isLineItem = mode === 'line-item';
  const isQuickFind = mode === 'quickfind';
  const isGrid = mode === 'desktop' || mode === 'touch';

  // ── Data ──────────────────────────────────────────────────────────────────────

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
    enabled: isGrid,
  });

  const { data: productsData } = useQuery<Product[]>({
    queryKey: ['products', 'terminal', search, selectedCategory],
    queryFn: () =>
      api
        .get('/products', { params: { q: search || undefined, categoryId: selectedCategory || undefined, pageSize: 80 } })
        .then((r) => r.data.data),
    enabled: isGrid,
  });

  const { data: heldOrders } = useQuery<HeldOrder[]>({
    queryKey: ['orders', 'held'],
    queryFn: () => api.get('/held-orders').then((r) => r.data.data),
  });

  // ── Cart helpers ──────────────────────────────────────────────────────────────

  const addToCart = useCallback((product: Product, variantId?: string) => {
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
    const price = variant?.price ?? product.price;
    const name = product.name + (variant ? ` (${variant.attributeValues.map((v) => v.value).join(' / ')})` : '');

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
          requiresAgeVerification: product.requiresAgeVerification,
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

  function setQty(index: number, qty: number) {
    if (qty <= 0) return;
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: qty } : item)));
  }

  const subtotal = cart.reduce((s, i) => s + (i.price - i.discount) * i.quantity, 0);

  function handleOrderComplete() {
    setCart([]);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }

  // ── Hold order ────────────────────────────────────────────────────────────────

  const holdMutation = useMutation({
    mutationFn: async (heldName: string) => {
      const { data: orderRes } = await api.post('/orders', {
        locationId,
        sessionId: sessionId ?? undefined,
        items: cart.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          price: i.price,
          discount: i.discount,
        })),
      });
      await api.post(`/held-orders/${orderRes.data.id}/hold`, { heldName });
    },
    onSuccess: () => {
      setCart([]);
      setHoldDialogOpen(false);
      setHoldNameInput('');
      queryClient.invalidateQueries({ queryKey: ['orders', 'held'] });
    },
  });

  function resumeHeld(held: HeldOrder) {
    const items: CartItem[] = held.items.map((item) => ({
      productId: item.productId ?? '',
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      price: item.price,
      quantity: item.quantity,
      discount: item.discount,
    }));
    setCart(items);
    api.post(`/held-orders/${held.id}/resume`).then(() => {
      queryClient.invalidateQueries({ queryKey: ['orders', 'held'] });
    });
    setHeldPanelOpen(false);
  }

  // ── Save as estimate ──────────────────────────────────────────────────────────

  const estimateMutation = useMutation({
    mutationFn: () =>
      api.post('/estimates', {
        locationId,
        items: cart.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          price: i.price,
          discount: i.discount,
        })),
      }),
    onSuccess: () => {
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
    },
  });

  const cashDropMutation = useMutation({
    mutationFn: ({ amount, note }: { amount: number; note?: string }) =>
      api.post(`/cash-drops/sessions/${sessionId}`, { amount, note }),
    onSuccess: () => {
      setCashDropOpen(false);
      setCashDropAmount('');
      setCashDropNote('');
    },
  });

  // Barcode scanner: detect rapid keystrokes from HID scanner (fires keydown globally)
  const handleBarcodeInput = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;
    const res = await api.get('/products', { params: { barcode: barcode.trim() } });
    const matches: Product[] = res.data.data ?? [];
    if (matches.length === 1) {
      const product = matches[0];
      if (product.variants.length > 0) setVariantProduct(product);
      else addToCart(product);
    }
  }, [addToCart]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') {
        const buf = barcodeBuffer.current;
        barcodeBuffer.current = '';
        if (barcodeTimer.current) { clearTimeout(barcodeTimer.current); barcodeTimer.current = null; }
        if (buf.length > 2) handleBarcodeInput(buf);
        return;
      }
      if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 100);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleBarcodeInput]);

  // ── Mode toggle buttons ───────────────────────────────────────────────────────

  const modeButtons: Array<{ id: TerminalMode; icon: React.ReactNode; label: string }> = [
    { id: 'desktop', icon: <Grid3x3 className="h-4 w-4" />, label: 'Grid' },
    { id: 'touch',   icon: <Tablet className="h-4 w-4" />,   label: 'Touch' },
    { id: 'line-item', icon: <List className="h-4 w-4" />,   label: 'Line Item' },
    { id: 'quickfind', icon: <BookOpen className="h-4 w-4" />, label: 'QuickFind' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex h-full', isTouch ? 'terminal-touch' : '')}>

      {/* ── Left panel: product browser ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col border-r overflow-hidden">

        {/* Toolbar */}
        <div className="p-2 border-b flex items-center gap-2 flex-wrap">
          {isGrid && (
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search products or scan barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && search.trim()) {
                    const res = await api.get('/products', { params: { barcode: search.trim() } });
                    const matches: Product[] = res.data.data ?? [];
                    if (matches.length === 1) {
                      const product = matches[0];
                      if (product.variants.length > 0) setVariantProduct(product);
                      else addToCart(product);
                      setSearch('');
                    }
                  }
                }}
              />
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            onClick={() => { setMiscForm({ name: '', price: '', qty: '1' }); setMiscError(''); setMiscOpen(true); }}
          >
            <PackagePlus className="h-3.5 w-3.5" />
            Misc
          </Button>
          {!isGrid && <span className="flex-1 text-sm font-medium text-muted-foreground">{mode === 'line-item' ? 'Line Item Entry' : 'QuickFind'}</span>}

          {/* Mode switcher */}
          <div className="flex gap-1 border rounded-md p-0.5">
            {modeButtons.map((m) => (
              <button
                key={m.id}
                title={m.label}
                onClick={() => setMode(m.id)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                  mode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.icon}
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category tabs — grid modes only */}
        {isGrid && categories && categories.length > 0 && (
          <div className="flex gap-2 px-3 py-2 border-b overflow-x-auto shrink-0">
            <Button size="sm" variant={selectedCategory === null ? 'default' : 'outline'} onClick={() => setSelectedCategory(null)}>
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

        {/* Mode content */}
        {isLineItem && (
          <LineItemMode
            cart={cart}
            onAddToCart={addToCart}
            onUpdateQty={setQty}
            onRemove={(i) => setCart((prev) => prev.filter((_, idx) => idx !== i))}
            onVariantRequired={(p) => setVariantProduct(p)}
          />
        )}

        {isQuickFind && (
          <QuickFindPanel
            onAddToCart={addToCart}
            onVariantRequired={(p) => setVariantProduct(p)}
          />
        )}

        {isGrid && (
          <div
            className={cn(
              'flex-1 overflow-y-auto p-3 grid gap-2',
              isTouch ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5',
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
                    if (hasVariants) setVariantProduct(product);
                    else addToCart(product);
                  }}
                >
                  <CardContent className={cn('p-3 flex flex-col gap-1', isTouch ? 'p-4' : '')}>
                    <p className={cn('font-medium leading-tight', isTouch ? 'text-base' : 'text-sm')}>
                      {product.name}
                    </p>
                    <p className="text-primary font-semibold text-sm">{formatCurrency(product.price)}</p>
                    {product.sku && <p className="text-xs text-muted-foreground">{product.sku}</p>}
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
              <div className="col-span-full text-center text-muted-foreground py-12">No products found</div>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel: cart ───────────────────────────────────────────────── */}
      <div className="w-80 flex flex-col bg-muted/20">
        <div className="p-3 border-b font-semibold flex items-center justify-between">
          <span>Order</span>
          <div className="flex items-center gap-2">
            {!locationId && (
              <span className="flex items-center gap-1 text-xs font-normal text-amber-600">
                <AlertCircle className="h-3 w-3" />
                No register
              </span>
            )}
            {sessionId && (
              <button
                className="text-muted-foreground hover:text-foreground"
                title="Record cash drop"
                onClick={() => { setCashDropAmount(''); setCashDropNote(''); setCashDropOpen(true); }}
              >
                <DollarSign className="h-4 w-4" />
              </button>
            )}
            {/* Held orders dropdown */}
            <button
              className="relative text-muted-foreground hover:text-foreground"
              title="Held transactions"
              onClick={() => setHeldPanelOpen((o) => !o)}
            >
              <PauseCircle className="h-4 w-4" />
              {(heldOrders?.length ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full text-[9px] w-3.5 h-3.5 flex items-center justify-center font-bold">
                  {heldOrders!.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Held orders panel */}
        {heldPanelOpen && (
          <div className="border-b bg-background shadow-sm">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Held Transactions
            </div>
            {(heldOrders?.length ?? 0) === 0 && (
              <p className="px-3 pb-3 text-sm text-muted-foreground">None held</p>
            )}
            {heldOrders?.map((held) => (
              <button
                key={held.id}
                className="w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center justify-between text-sm"
                onClick={() => resumeHeld(held)}
              >
                <span className="font-medium">{held.heldName}</span>
                <span className="text-xs text-muted-foreground">
                  {held.items.reduce((n, i) => n + i.quantity, 0)} items
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {cart.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">Cart is empty</p>
          )}
          {cart.map((item, i) => (
            <div key={i} className="bg-background rounded-md p-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(item.price)} each</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(i, -1)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-5 text-center text-sm font-medium">{item.quantity}</span>
                <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(i, 1)}>
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

        {/* Totals + actions */}
        <div className="border-t p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          <Button
            className="w-full"
            size={isTouch ? 'lg' : 'default'}
            disabled={cart.length === 0 || !locationId}
            onClick={() => setCheckoutOpen(true)}
          >
            Charge {cart.length > 0 && formatCurrency(subtotal)}
          </Button>
          {cart.length > 0 && (
            <div className="grid grid-cols-3 gap-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={!locationId}
                onClick={() => setHoldDialogOpen(true)}
                title="Hold this transaction"
              >
                <PauseCircle className="h-3 w-3 mr-1" />
                Hold
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={!locationId}
                onClick={() => estimateMutation.mutate()}
                title="Save as estimate/quote"
              >
                <FileText className="h-3 w-3 mr-1" />
                Estimate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={() => setCart([])}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Misc item dialog ─────────────────────────────────────────────────── */}
      {miscOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMiscOpen(false)} />
          <div className="relative bg-background rounded-lg shadow-xl w-80 p-6 space-y-4">
            <h3 className="font-semibold">Misc / Open-Price Item</h3>
            <div className="space-y-1.5">
              <Label htmlFor="misc-name">Description *</Label>
              <Input
                id="misc-name"
                autoFocus
                placeholder="e.g. Labor charge, Bag fee…"
                value={miscForm.name}
                onChange={(e) => setMiscForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="misc-price">Price *</Label>
                <Input
                  id="misc-price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={miscForm.price}
                  onChange={(e) => setMiscForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="misc-qty">Qty</Label>
                <Input
                  id="misc-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={miscForm.qty}
                  onChange={(e) => setMiscForm((f) => ({ ...f, qty: e.target.value }))}
                />
              </div>
            </div>
            {miscError && <p className="text-sm text-destructive">{miscError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMiscOpen(false)}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={() => {
                  const price = parseFloat(miscForm.price);
                  const qty = parseInt(miscForm.qty, 10);
                  if (!miscForm.name.trim()) return setMiscError('Description is required');
                  if (isNaN(price) || price < 0) return setMiscError('Enter a valid price');
                  if (isNaN(qty) || qty < 1) return setMiscError('Enter a valid quantity');
                  setCart((prev) => [...prev, { name: miscForm.name.trim(), price, quantity: qty, discount: 0 }]);
                  setMiscOpen(false);
                }}
              >
                Add to Cart
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cash drop dialog ──────────────────────────────────────────────────── */}
      {cashDropOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCashDropOpen(false)} />
          <div className="relative bg-background rounded-lg shadow-xl w-80 p-6 space-y-4">
            <h3 className="font-semibold">Record Cash Drop</h3>
            <p className="text-sm text-muted-foreground">Enter the amount of cash being removed from the drawer.</p>
            <div className="space-y-1.5">
              <Label htmlFor="drop-amount">Amount *</Label>
              <Input
                id="drop-amount"
                type="number"
                min="0.01"
                step="0.01"
                autoFocus
                placeholder="0.00"
                value={cashDropAmount}
                onChange={(e) => setCashDropAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const amount = parseFloat(cashDropAmount);
                    if (!isNaN(amount) && amount > 0) cashDropMutation.mutate({ amount, note: cashDropNote.trim() || undefined });
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drop-note">Note</Label>
              <Input
                id="drop-note"
                placeholder="e.g. Safe drop"
                value={cashDropNote}
                onChange={(e) => setCashDropNote(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCashDropOpen(false)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={cashDropMutation.isPending || !cashDropAmount}
                onClick={() => {
                  const amount = parseFloat(cashDropAmount);
                  if (isNaN(amount) || amount <= 0) return;
                  cashDropMutation.mutate({ amount, note: cashDropNote.trim() || undefined });
                }}
              >
                {cashDropMutation.isPending ? 'Saving…' : 'Record Drop'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hold dialog ──────────────────────────────────────────────────────── */}
      {holdDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setHoldDialogOpen(false)} />
          <div className="relative bg-background rounded-lg shadow-xl w-80 p-6 space-y-4">
            <h3 className="font-semibold">Hold Transaction</h3>
            <p className="text-sm text-muted-foreground">Give this transaction a name so you can retrieve it later.</p>
            <Input
              autoFocus
              placeholder="e.g. Table 4, John Doe…"
              value={holdNameInput}
              onChange={(e) => setHoldNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && holdNameInput.trim() && holdMutation.mutate(holdNameInput.trim())}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setHoldDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!holdNameInput.trim() || holdMutation.isPending}
                onClick={() => holdMutation.mutate(holdNameInput.trim())}
              >
                {holdMutation.isPending ? 'Saving…' : 'Hold'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Variant picker ───────────────────────────────────────────────────── */}
      {variantProduct && (
        <VariantPickerModal
          product={variantProduct}
          onSelect={(product, variantId) => {
            addToCart(product, variantId);
            setVariantProduct(null);
          }}
          onClose={() => setVariantProduct(null)}
        />
      )}

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
