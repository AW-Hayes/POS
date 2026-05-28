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
import { formatCurrency } from '@/lib/utils';
import { ArrowRightLeft, Plus, Trash2, Search } from 'lucide-react';
import type { Product } from '@pos/types';

interface Location { id: string; name: string }

interface TransferLine {
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
}

export function StockTransfersPage() {
  const [open, setOpen] = useState(false);
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const qc = useQueryClient();

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-transfer', productSearch],
    queryFn: () =>
      api.get('/products', { params: { search: productSearch, pageSize: 20 } }).then((r) => r.data.data),
    enabled: productSearch.length >= 2,
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      api.post('/inventory/transfer', {
        fromLocationId,
        toLocationId,
        items: lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setSuccessMsg('Transfer completed successfully.');
      setLines([]);
      setNote('');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Transfer failed');
    },
  });

  function addProduct(product: Product) {
    if (lines.find((l) => l.productId === product.id && !l.variantId)) return;
    setLines((prev) => [...prev, { productId: product.id, name: product.name, quantity: 1 }]);
    setProductSearch('');
  }

  function updateQty(idx: number, qty: number) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: qty } : l)));
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    setFormError('');
    if (!fromLocationId) return setFormError('Select a source location');
    if (!toLocationId) return setFormError('Select a destination location');
    if (fromLocationId === toLocationId) return setFormError('Source and destination must be different');
    if (lines.length === 0) return setFormError('Add at least one product');
    if (lines.some((l) => l.quantity <= 0)) return setFormError('All quantities must be greater than 0');
    transferMutation.mutate();
  }

  function openNew() {
    setFromLocationId('');
    setToLocationId('');
    setNote('');
    setLines([]);
    setFormError('');
    setProductSearch('');
    setOpen(true);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stock Transfers</h1>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Transfer
        </Button>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
        <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Transfer inventory between locations</p>
        <p className="text-sm mt-1">Each transfer debits the source and credits the destination with a full audit trail.</p>
        <Button className="mt-4" onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          Start a Transfer
        </Button>
      </div>

      {/* Transfer dialog */}
      <Dialog open={open} onOpenChange={(o) => { if (!transferMutation.isPending) setOpen(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Stock Transfer</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>From Location</Label>
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger><SelectValue placeholder="Source…" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>To Location</Label>
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger><SelectValue placeholder="Destination…" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Product search */}
            <div className="space-y-1">
              <Label>Add Product</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search products to transfer…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
              {products.length > 0 && productSearch.length >= 2 && (
                <div className="border rounded-md bg-background shadow-sm divide-y max-h-48 overflow-y-auto">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between items-center"
                      onClick={() => addProduct(p)}
                    >
                      <span>{p.name}</span>
                      <span className="text-muted-foreground">{formatCurrency(p.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lines */}
            {lines.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Product</th>
                      <th className="text-right p-2 font-medium w-24">Qty</th>
                      <th className="p-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="p-2">{line.name}</td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => updateQty(idx, Number(e.target.value))}
                            className="h-7 text-right w-20 ml-auto"
                          />
                        </td>
                        <td className="p-2">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeLine(idx)}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input
                placeholder="Reason for transfer…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={transferMutation.isPending}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleSubmit}
              disabled={transferMutation.isPending || lines.length === 0}
            >
              {transferMutation.isPending ? 'Transferring…' : `Transfer ${lines.length > 0 ? `(${lines.length})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
