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
import { Search, AlertTriangle, SlidersHorizontal } from 'lucide-react';
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

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [showLowStock, setShowLowStock] = useState(false);
  const [search, setSearch] = useState('');
  const [adjustItem, setAdjustItem] = useState<InventoryWithProduct | null>(null);
  const [form, setForm] = useState<AdjustFormData>({ delta: '', type: 'adjustment', note: '' });
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', showLowStock],
    queryFn: () =>
      api.get('/inventory', { params: { lowStock: showLowStock || undefined, pageSize: 100 } }).then((r) => r.data),
  });

  const items: InventoryWithProduct[] = (data?.data ?? []).filter((item: InventoryWithProduct) =>
    search ? item.product.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

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

  const variantLabel = (item: InventoryWithProduct) =>
    item.variant?.attributeValues.map((v) => v.value).join(' / ') ?? null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <Button
          variant={showLowStock ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => setShowLowStock((v) => !v)}
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          {showLowStock ? 'Showing low stock' : 'Show low stock'}
        </Button>
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
