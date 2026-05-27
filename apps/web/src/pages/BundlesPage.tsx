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
import { formatCurrency } from '@/lib/utils';
import { Package, Plus, Trash2, Search } from 'lucide-react';

interface BundleComponent {
  id: string;
  quantity: number;
  componentProduct: { id: string; name: string; sku?: string; price: number };
}

interface BundleProduct {
  id: string;
  name: string;
  sku?: string;
  price: number;
  bundleComponents: BundleComponent[];
  category?: { name: string; color?: string } | null;
}

interface Product { id: string; name: string; sku?: string; price: number }

export function BundlesPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<BundleProduct | null>(null);
  const [addSearch, setAddSearch] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addProductId, setAddProductId] = useState('');
  const [addError, setAddError] = useState('');

  const { data: bundles = [], isLoading } = useQuery<BundleProduct[]>({
    queryKey: ['bundles'],
    queryFn: () => api.get('/bundles').then((r) => r.data.data),
  });

  const { data: searchResults } = useQuery<Product[]>({
    queryKey: ['products-search', addSearch],
    queryFn: () =>
      api.get('/products', { params: { q: addSearch || undefined, pageSize: 10 } }).then((r) => r.data.data),
    enabled: addSearch.length >= 2,
  });

  const addComponentMutation = useMutation({
    mutationFn: (v: object) => api.post(`/bundles/${selected!.id}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundles'] });
      setAddSearch('');
      setAddQty('1');
      setAddProductId('');
      setAddError('');
    },
    onError: (err: unknown) => setAddError(err instanceof Error ? err.message : 'Failed'),
  });

  const deleteComponentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bundles/components/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bundles'] }),
  });

  const selectedBundle = bundles.find((b) => b.id === selected?.id) ?? selected;
  const components = selectedBundle?.bundleComponents ?? [];
  const componentTotal = components.reduce((s, c) => s + c.componentProduct.price * c.quantity, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Bundles</h1>
          <p className="text-sm text-muted-foreground mt-1">Any product with bundle components becomes a bundle. Add components to an existing product.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: bundle list */}
        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Bundles</h2>
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {!isLoading && bundles.length === 0 && (
            <p className="text-sm text-muted-foreground">No bundles yet. Select a product below to add components.</p>
          )}
          {bundles.map((b) => (
            <button
              key={b.id}
              className={`w-full text-left border rounded-lg p-3 text-sm transition-colors hover:border-primary ${selected?.id === b.id ? 'border-primary bg-primary/5' : ''}`}
              onClick={() => setSelected(b)}
            >
              <div className="flex justify-between items-start">
                <p className="font-medium">{b.name}</p>
                <span className="text-muted-foreground">{formatCurrency(b.price)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{b.bundleComponents.length} component{b.bundleComponents.length !== 1 ? 's' : ''}</p>
            </button>
          ))}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Add components to any product:</p>
            <ProductPicker onSelect={(p) => setSelected(p as BundleProduct)} />
          </div>
        </div>

        {/* Right: component editor */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select or search for a product to define its bundle components</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-semibold text-lg">{selectedBundle?.name}</h2>
                <p className="text-sm text-muted-foreground">Bundle price: {formatCurrency(selectedBundle?.price ?? 0)} · Component list price: {formatCurrency(componentTotal)}</p>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Component</th>
                      <th className="text-right p-3 font-medium">Unit Price</th>
                      <th className="text-right p-3 font-medium">Qty</th>
                      <th className="text-right p-3 font-medium">Subtotal</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {components.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="p-3">
                          <p className="font-medium">{c.componentProduct.name}</p>
                          {c.componentProduct.sku && <p className="text-xs text-muted-foreground">{c.componentProduct.sku}</p>}
                        </td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(c.componentProduct.price)}</td>
                        <td className="p-3 text-right tabular-nums">{c.quantity}</td>
                        <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(c.componentProduct.price * c.quantity)}</td>
                        <td className="p-3">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteComponentMutation.mutate(c.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {components.length === 0 && (
                      <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No components yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-medium text-sm">Add Component</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search products…"
                    value={addSearch}
                    onChange={(e) => { setAddSearch(e.target.value); setAddProductId(''); }}
                  />
                </div>
                {addSearch.length >= 2 && !addProductId && (
                  <div className="border rounded-md max-h-36 overflow-y-auto divide-y text-sm">
                    {(searchResults ?? []).map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50"
                        onClick={() => { setAddProductId(p.id); setAddSearch(p.name); }}
                      >
                        <span className="font-medium">{p.name}</span>
                        {p.sku && <span className="text-muted-foreground ml-2 text-xs">{p.sku}</span>}
                        <span className="float-right text-muted-foreground">{formatCurrency(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input className="w-24 h-8 text-sm" type="number" min="0.01" step="0.01" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
                  </div>
                  <Button
                    size="sm"
                    disabled={!addProductId || !addQty || addComponentMutation.isPending}
                    onClick={() => addComponentMutation.mutate({ componentProductId: addProductId, quantity: parseFloat(addQty) || 1 })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />Add
                  </Button>
                </div>
                {addError && <p className="text-sm text-destructive">{addError}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductPicker({ onSelect }: { onSelect: (p: { id: string; name: string; price: number }) => void }) {
  const [search, setSearch] = useState('');
  const { data } = useQuery<{ id: string; name: string; price: number }[]>({
    queryKey: ['products-search-picker', search],
    queryFn: () => api.get('/products', { params: { q: search || undefined, pageSize: 8 } }).then((r) => r.data.data),
    enabled: search.length >= 2,
  });

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input className="pl-8 h-8 text-sm" placeholder="Search product…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {search.length >= 2 && (
        <div className="border rounded-md max-h-36 overflow-y-auto divide-y text-sm">
          {(data ?? []).map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-3 py-1.5 hover:bg-muted/50 text-xs"
              onClick={() => { onSelect(p); setSearch(''); }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
