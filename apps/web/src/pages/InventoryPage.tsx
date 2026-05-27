import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Search, AlertTriangle, SlidersHorizontal, PackagePlus, ArrowLeftRight } from 'lucide-react';
import type { InventoryWithProduct } from '@pos/types';

const ADJUSTMENT_TYPES = [
  { value: 'adjustment', label: 'Manual Adjustment' },
  { value: 'purchase', label: 'Purchase / Restock' },
  { value: 'damage', label: 'Damage' },
  { value: 'shrinkage', label: 'Shrinkage' },
  { value: 'return', label: 'Return' },
];

interface AdjustFormData {
  delta: string;
  type: string;
  note: string;
}

interface ReceiveFormData {
  locationId: string;
  productId: string;
  variantId: string;
  quantity: string;
  note: string;
}

interface TransferFormData {
  fromLocationId: string;
  toLocationId: string;
  productId: string;
  variantId: string;
  quantity: string;
  note: string;
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [showLowStock, setShowLowStock] = useState(false);
  const [search, setSearch] = useState('');
  const [adjustItem, setAdjustItem] = useState<InventoryWithProduct | null>(null);
  const [form, setForm] = useState<AdjustFormData>({ delta: '', type: 'adjustment', note: '' });
  const [formError, setFormError] = useState('');

  // Receive stock dialog state
  const [showReceive, setShowReceive] = useState(false);

  // Transfer dialog state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferSearch, setTransferSearch] = useState('');
  const [transferForm, setTransferForm] = useState<TransferFormData>({
    fromLocationId: '', toLocationId: '', productId: '', variantId: '', quantity: '', note: '',
  });
  const [transferError, setTransferError] = useState('');
  const [receiveSearch, setReceiveSearch] = useState('');
  const [receiveForm, setReceiveForm] = useState<ReceiveFormData>({
    locationId: '', productId: '', variantId: '', quantity: '', note: '',
  });
  const [receiveError, setReceiveError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', showLowStock],
    queryFn: () =>
      api.get('/inventory', { params: { lowStock: showLowStock || undefined, pageSize: 100 } }).then((r) => r.data),
  });

  const items: InventoryWithProduct[] = (data?.data ?? []).filter((item: InventoryWithProduct) =>
    search ? item.product.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data.data),
  });
  const locations: { id: string; name: string }[] = locationsData ?? [];

  const { data: productSearchData } = useQuery({
    queryKey: ['products-search', receiveSearch],
    queryFn: () =>
      api.get('/products', { params: { q: receiveSearch || undefined, pageSize: 20 } }).then((r) => r.data.data),
    enabled: showReceive,
  });

  const { data: transferProductData } = useQuery({
    queryKey: ['products-search', transferSearch],
    queryFn: () =>
      api.get('/products', { params: { q: transferSearch || undefined, pageSize: 20 } }).then((r) => r.data.data),
    enabled: showTransfer,
  });
  const transferProductResults: typeof productResults = transferProductData ?? [];
  const productResults: { id: string; name: string; sku?: string; variants: { id: string; sku?: string; attributeValues: { value: string }[] }[] }[] =
    productSearchData ?? [];

  const selectedProduct = productResults.find((p) => p.id === receiveForm.productId);

  const adjustMutation = useMutation({
    mutationFn: (payload: object) => api.post('/inventory/adjust', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setAdjustItem(null);
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Adjustment failed');
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (payload: object) => api.post('/inventory/adjust', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setShowReceive(false);
      setReceiveSearch('');
      setReceiveForm({ locationId: '', productId: '', variantId: '', quantity: '', note: '' });
      setReceiveError('');
    },
    onError: (err: unknown) => {
      setReceiveError(err instanceof Error ? err.message : 'Failed to record stock');
    },
  });

  const transferMutation = useMutation({
    mutationFn: (payload: object) => api.post('/inventory/transfer', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setShowTransfer(false);
      setTransferSearch('');
      setTransferForm({ fromLocationId: '', toLocationId: '', productId: '', variantId: '', quantity: '', note: '' });
      setTransferError('');
    },
    onError: (err: unknown) => {
      setTransferError(err instanceof Error ? err.message : 'Transfer failed');
    },
  });

  function openAdjust(item: InventoryWithProduct) {
    setAdjustItem(item);
    setForm({ delta: '', type: 'adjustment', note: '' });
    setFormError('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const delta = parseInt(form.delta, 10);
    if (isNaN(delta) || delta === 0) return setFormError('Enter a non-zero integer');
    if (!adjustItem) return;

    adjustMutation.mutate({
      locationId: adjustItem.locationId,
      productId: adjustItem.productId,
      variantId: adjustItem.variantId ?? undefined,
      type: form.type,
      delta,
      note: form.note.trim() || undefined,
    });
  }

  function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReceiveError('');
    if (!receiveForm.locationId) return setReceiveError('Select a location');
    if (!receiveForm.productId) return setReceiveError('Select a product');
    const qty = parseFloat(receiveForm.quantity);
    if (isNaN(qty) || qty === 0) return setReceiveError('Enter a non-zero quantity');

    receiveMutation.mutate({
      locationId: receiveForm.locationId,
      productId: receiveForm.productId,
      variantId: receiveForm.variantId || undefined,
      type: 'purchase',
      delta: qty,
      note: receiveForm.note.trim() || undefined,
    });
  }

  function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTransferError('');
    if (!transferForm.fromLocationId) return setTransferError('Select a source location');
    if (!transferForm.toLocationId) return setTransferError('Select a destination location');
    if (transferForm.fromLocationId === transferForm.toLocationId) return setTransferError('Source and destination must differ');
    if (!transferForm.productId) return setTransferError('Select a product');
    const qty = parseInt(transferForm.quantity, 10);
    if (isNaN(qty) || qty <= 0) return setTransferError('Enter a positive quantity');

    transferMutation.mutate({
      fromLocationId: transferForm.fromLocationId,
      toLocationId: transferForm.toLocationId,
      items: [{ productId: transferForm.productId, variantId: transferForm.variantId || undefined, quantity: qty }],
      note: transferForm.note.trim() || undefined,
    });
  }

  const variantLabel = (item: InventoryWithProduct) =>
    item.variant?.attributeValues.map((v) => v.value).join(' / ') ?? null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowReceive(true); setReceiveSearch(''); }}
          >
            <PackagePlus className="h-4 w-4 mr-1" />
            Receive Stock
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowTransfer(true); setTransferSearch(''); }}
          >
            <ArrowLeftRight className="h-4 w-4 mr-1" />
            Transfer
          </Button>
          <Button
            variant={showLowStock ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setShowLowStock((v) => !v)}
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            {showLowStock ? 'Showing low stock' : 'Show low stock'}
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Filter by product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-left p-3 font-medium">Variant</th>
                <th className="text-left p-3 font-medium">SKU</th>
                <th className="text-right p-3 font-medium">Qty</th>
                <th className="text-right p-3 font-medium">Low Stock At</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                const isLow = item.lowStockAt != null && item.quantity <= item.lowStockAt;
                return (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{item.product.name}</td>
                    <td className="p-3 text-muted-foreground">{variantLabel(item) ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">
                      {item.variant?.sku ?? item.product.sku ?? '—'}
                    </td>
                    <td className={`p-3 text-right font-semibold tabular-nums ${isLow ? 'text-destructive' : ''}`}>
                      {item.quantity}
                    </td>
                    <td className="p-3 text-right text-muted-foreground tabular-nums">
                      {item.lowStockAt ?? '—'}
                    </td>
                    <td className="p-3 text-center">
                      {isLow ? (
                        <Badge variant="destructive">Low Stock</Badge>
                      ) : (
                        <Badge variant="success">In Stock</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Adjust stock"
                          onClick={() => openAdjust(item)}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No inventory records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Receive Stock dialog */}
      <Dialog open={showReceive} onOpenChange={(open) => { if (!open) { setShowReceive(false); setReceiveError(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReceiveSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Location *</Label>
              <Select
                value={receiveForm.locationId}
                onValueChange={(v) => setReceiveForm((f) => ({ ...f, locationId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location…" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Product *</Label>
              <Input
                placeholder="Search by name or SKU…"
                value={receiveSearch}
                onChange={(e) => {
                  setReceiveSearch(e.target.value);
                  setReceiveForm((f) => ({ ...f, productId: '', variantId: '' }));
                }}
              />
              {productResults.length > 0 && !receiveForm.productId && (
                <div className="border rounded-md max-h-40 overflow-y-auto divide-y text-sm">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setReceiveForm((f) => ({ ...f, productId: p.id, variantId: '' }));
                        setReceiveSearch(p.name);
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.sku && <span className="text-muted-foreground ml-2">{p.sku}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedProduct && selectedProduct.variants.length > 0 && (
              <div className="space-y-1.5">
                <Label>Variant</Label>
                <Select
                  value={receiveForm.variantId}
                  onValueChange={(v) => setReceiveForm((f) => ({ ...f, variantId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No variant (base product)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Base product</SelectItem>
                    {selectedProduct.variants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.attributeValues.map((av) => av.value).join(' / ')}
                        {v.sku && ` — ${v.sku}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="recv-qty">Quantity *</Label>
              <Input
                id="recv-qty"
                type="number"
                step="any"
                value={receiveForm.quantity}
                onChange={(e) => setReceiveForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder="e.g. 50"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recv-note">Note</Label>
              <Input
                id="recv-note"
                value={receiveForm.note}
                onChange={(e) => setReceiveForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Initial stock, PO #1234"
              />
            </div>

            {receiveError && <p className="text-sm text-destructive">{receiveError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={receiveMutation.isPending}>
                {receiveMutation.isPending ? 'Saving…' : 'Record Stock'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Stock dialog */}
      <Dialog open={showTransfer} onOpenChange={(open) => { if (!open) { setShowTransfer(false); setTransferError(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Stock</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTransferSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From *</Label>
                <Select
                  value={transferForm.fromLocationId}
                  onValueChange={(v) => setTransferForm((f) => ({ ...f, fromLocationId: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Source…" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To *</Label>
                <Select
                  value={transferForm.toLocationId}
                  onValueChange={(v) => setTransferForm((f) => ({ ...f, toLocationId: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Destination…" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Product *</Label>
              <Input
                placeholder="Search by name or SKU…"
                value={transferSearch}
                onChange={(e) => {
                  setTransferSearch(e.target.value);
                  setTransferForm((f) => ({ ...f, productId: '', variantId: '' }));
                }}
              />
              {transferProductResults.length > 0 && !transferForm.productId && (
                <div className="border rounded-md max-h-40 overflow-y-auto divide-y text-sm">
                  {transferProductResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setTransferForm((f) => ({ ...f, productId: p.id, variantId: '' }));
                        setTransferSearch(p.name);
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.sku && <span className="text-muted-foreground ml-2">{p.sku}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(() => {
              const sel = transferProductResults.find((p) => p.id === transferForm.productId);
              return sel && sel.variants.length > 0 ? (
                <div className="space-y-1.5">
                  <Label>Variant</Label>
                  <Select
                    value={transferForm.variantId}
                    onValueChange={(v) => setTransferForm((f) => ({ ...f, variantId: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Base product" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Base product</SelectItem>
                      {sel.variants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.attributeValues.map((av) => av.value).join(' / ')}
                          {v.sku && ` — ${v.sku}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null;
            })()}

            <div className="space-y-1.5">
              <Label htmlFor="xfer-qty">Quantity *</Label>
              <Input
                id="xfer-qty"
                type="number"
                min={1}
                step={1}
                value={transferForm.quantity}
                onChange={(e) => setTransferForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder="e.g. 10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xfer-note">Note</Label>
              <Input
                id="xfer-note"
                value={transferForm.note}
                onChange={(e) => setTransferForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Seasonal restock"
              />
            </div>

            {transferError && <p className="text-sm text-destructive">{transferError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={transferMutation.isPending}>
                {transferMutation.isPending ? 'Transferring…' : 'Transfer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustItem} onOpenChange={(open) => !open && setAdjustItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
          </DialogHeader>
          {adjustItem && (
            <div className="mb-4 rounded-md bg-muted px-4 py-3 text-sm">
              <p className="font-medium">{adjustItem.product.name}</p>
              {variantLabel(adjustItem) && (
                <p className="text-muted-foreground">{variantLabel(adjustItem)}</p>
              )}
              <p className="text-muted-foreground">Current qty: <span className="font-semibold tabular-nums">{adjustItem.quantity}</span></p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-delta">Quantity change *</Label>
              <Input
                id="adj-delta"
                type="number"
                step="1"
                value={form.delta}
                onChange={(e) => setForm((f) => ({ ...f, delta: e.target.value }))}
                placeholder="e.g. +10 or -3"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Use a negative number to reduce stock.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-note">Note</Label>
              <Input
                id="adj-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optional reason"
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={adjustMutation.isPending}>
                {adjustMutation.isPending ? 'Saving…' : 'Apply Adjustment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
